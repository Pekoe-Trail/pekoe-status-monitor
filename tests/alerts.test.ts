import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  currentAlerts,
  fetchAlerts,
  lastPublishedAt,
  mergeAlerts,
  parsePage,
  type Alert,
} from '../scripts/lib/alerts.ts';

/**
 * Builds a PSA as the API returns it, with some fields the page doesn't use.
 *
 * @param overrides Fields to replace or add.
 * @returns The PSA object.
 */
function psa(overrides: Record<string, unknown> = {}) {
  return {
    id: 'a1',
    number: 'TPTO-PSA-00000001',
    current: true,
    severity: { value: 'ADVISORY', rank: 1, colour: 'Yellow', label: 'Advisory', hex: '#FBC02D' },
    category: { value: 'WEATHER_LANDSLIDES', label: 'Weather & Landslides' },
    incident: {
      id: 'i1',
      number: 'TPTO-INC-00000001',
      description: 'Landslide risk after heavy rain',
      status: 'OPEN',
    },
    title: 'Heavy rain across the trail',
    impact: 'Paths are slippery.',
    action: 'Wear good boots.',
    links: [],
    reviewAt: null,
    stages: [{ id: 's4', number: 4 }],
    translations: [{ localeId: 'en', title: 'Heavy rain across the trail' }],
    publishedAt: '2026-09-20T03:30:00.000Z',
    channels: ['WEBSITE', 'HOMEPAGE', 'APP', 'PUSH'],
    ...overrides,
  };
}

/**
 * Wraps PSAs in the API's paged response shape.
 *
 * @param data The PSAs on the page.
 * @param next The next page number, or null on the last page.
 * @returns The response body.
 */
const body = (data: unknown[], next: number | null = null) => ({
  statusCode: 200,
  data: { data, meta: { total: data.length, lastPage: 1, currentPage: 1, perPage: 50, prev: null, next } },
});

describe('parsePage', () => {
  it('keeps only the fields the page shows', () => {
    const { alerts, next } = parsePage(body([psa()]));
    expect(next).toBeNull();
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).not.toHaveProperty('translations');
    expect(alerts[0]).not.toHaveProperty('reviewAt');
    expect(alerts[0]).not.toHaveProperty('current');
    expect(alerts[0].severity).toEqual({ value: 'ADVISORY', label: 'Advisory' });
    expect(alerts[0].stages).toEqual([{ number: 4 }]);
  });

  it("keeps an alert's channels in order, dropping ones it does not know", () => {
    const { alerts } = parsePage(
      body([
        psa({ channels: ['EMAIL', 'SMS', 'HOMEPAGE', 'WEBSITE'] }),
        psa({ id: 'a2', channels: undefined }),
      ]),
    );
    expect(alerts.map((a) => a.channels)).toEqual([['WEBSITE', 'HOMEPAGE', 'EMAIL'], []]);
  });

  it('skips an alert with an unexpected shape', () => {
    const { alerts } = parsePage(
      body([
        psa(),
        psa({ id: 'a2', severity: { value: 'PURPLE', label: 'x' } }),
        psa({ id: 'a3', incident: undefined }),
      ]),
    );
    expect(alerts.map((a) => a.id)).toEqual(['a1']);
  });

  it('rejects a response that is not a page', () => {
    expect(() => parsePage({ data: [] })).toThrow();
  });
});

describe('fetchAlerts', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('follows pages up to the limit and drops non-https links', async () => {
    const fetch = vi.fn(async (url: URL) => {
      const n = Number(url.searchParams.get('pageNumber'));
      const item = psa({
        id: `p${n}`,
        links: [
          { url: n === 1 ? 'http://example.com' : 'https://example.com', label: null },
          { url: 'https://example.com/map', label: 'Map' },
        ],
      });
      return new Response(JSON.stringify(body([item], n + 1)));
    });
    vi.stubGlobal('fetch', fetch);

    const alerts = await fetchAlerts('https://api.example.com/v1/alerts/public/global/history', {
      timeoutMs: 1000,
      maxPages: 2,
    });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[0][0].searchParams.get('perPage')).toBe('50');
    expect(alerts.map((a) => [a.id, a.links.map((link) => link.url)])).toEqual([
      ['p1', ['https://example.com/map']],
      ['p2', ['https://example.com', 'https://example.com/map']],
    ]);
  });

  it('asks only for the alerts published since the watermark', async () => {
    const fetch = vi.fn(async (url: URL) => new Response(JSON.stringify(body([psa({ id: url.href })]))));
    vi.stubGlobal('fetch', fetch);

    await fetchAlerts('https://api.example.com/v1/alerts/public/history', {
      timeoutMs: 1000,
      maxPages: 4,
      updatedSince: '2026-09-23T04:30:00.000Z',
    });
    expect(fetch.mock.calls[0][0].searchParams.get('updatedSince')).toBe('2026-09-23T04:30:00.000Z');
  });

  it('asks for everything when there is no watermark', async () => {
    const fetch = vi.fn(async (url: URL) => new Response(JSON.stringify(body([psa({ id: url.href })]))));
    vi.stubGlobal('fetch', fetch);

    await fetchAlerts('https://api.example.com/x', { timeoutMs: 1000, maxPages: 1 });
    expect(fetch.mock.calls[0][0].searchParams.has('updatedSince')).toBe(false);
  });

  it('throws on an error response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 404 })));
    await expect(fetchAlerts('https://api.example.com/x', { timeoutMs: 1000, maxPages: 1 })).rejects.toThrow('HTTP 404');
  });
});

describe('currentAlerts', () => {
  /**
   * Builds an alert of one incident.
   *
   * @param id Its id.
   * @param publishedAt When it was published.
   * @param incident Its incident's id.
   * @param stages The stages it covers.
   * @param severity Its severity.
   * @param status Its incident's status when it was read.
   * @returns The alert.
   */
  const about = (
    id: string,
    publishedAt: string,
    incident: string,
    stages: number[],
    severity = 'ADVISORY',
    status = 'OPEN',
  ) =>
    psa({
      id,
      publishedAt,
      incident: { id: incident, number: incident, description: incident, status },
      stages: stages.map((number) => ({ id: `s${number}`, number })),
      severity: { value: severity, label: severity },
    });

  /**
   * Reads PSAs through the page parser and picks the ones showing now.
   *
   * @param items The PSAs as the API returns them.
   * @returns The ids of the alerts showing, in display order.
   */
  const current = (...items: ReturnType<typeof psa>[]) =>
    currentAlerts(parsePage(body(items)).alerts).map((a) => a.id);

  it('shows the newest alert of each incident on each stage, most severe first', () => {
    expect(
      current(
        about('slide-old', '2026-09-01T00:00:00Z', 'slide', [4]),
        about('slide-new', '2026-09-20T00:00:00Z', 'slide', [4]),
        about('cyclone', '2026-09-10T00:00:00Z', 'cyclone', [4, 5], 'CLOSED'),
      ),
    ).toEqual(['cyclone', 'slide-new']);
  });

  it('keeps an overlapping incident when another one clears', () => {
    expect(
      current(
        about('cyclone', '2026-09-10T00:00:00Z', 'cyclone', [4, 5], 'CLOSED'),
        about('slide', '2026-09-12T00:00:00Z', 'slide', [4], 'PRECAUTION'),
        about('slide-clear', '2026-09-15T00:00:00Z', 'slide', [4], 'OK', 'CLOSED'),
      ),
    ).toEqual(['cyclone']);
  });

  it("keeps an incident's alert on the stages an OK alert did not clear", () => {
    expect(
      current(
        about('cyclone', '2026-09-10T00:00:00Z', 'cyclone', [4, 5], 'CLOSED'),
        about('cyclone-4-clear', '2026-09-15T00:00:00Z', 'cyclone', [4], 'OK'),
      ),
    ).toEqual(['cyclone', 'cyclone-4-clear']);
  });

  it("shows a stage's all-clear once nothing is open there", () => {
    expect(
      current(
        about('red', '2026-09-01T00:00:00Z', 'slide', [4], 'CLOSED'),
        about('green', '2026-09-20T00:00:00Z', 'slide', [4], 'OK', 'CLOSED'),
      ),
    ).toEqual(['green']);
  });

  it('reads an incident as closed from its newest alert, even when older copies say open', () => {
    expect(
      current(
        about('slide-4', '2026-09-01T00:00:00Z', 'slide', [4], 'CLOSED', 'OPEN'),
        about('slide-5-clear', '2026-09-20T00:00:00Z', 'slide', [5], 'OK', 'CLOSED'),
      ),
    ).toEqual(['slide-5-clear']);
  });
});

describe('lastPublishedAt', () => {
  const at = (id: string, publishedAt: string) =>
    ({ ...psa({ id, publishedAt }) }) as unknown as Alert;

  it('takes the newest alert in the archive, whatever the order', () => {
    expect(
      lastPublishedAt([
        at('a', '2026-09-20T06:00:00.000Z'),
        at('b', '2026-09-23T04:30:00.000Z'),
        at('c', '2026-01-01T00:00:00.000Z'),
      ]),
    ).toBe('2026-09-23T04:30:00.000Z');
  });

  it('has no watermark for an empty archive', () => {
    expect(lastPublishedAt([])).toBeUndefined();
  });
});

describe('mergeAlerts', () => {
  const saved = (id: string, publishedAt: string, title = 'Heavy rain across the trail') =>
    ({
      ...psa({ id, publishedAt, title }),
      severity: { value: 'ADVISORY', label: 'Advisory' },
    }) as unknown as Alert;

  it('keeps alerts the read no longer reaches', () => {
    const old = saved('old', '2025-01-01T00:00:00.000Z');
    const recent = saved('recent', '2026-09-01T00:00:00.000Z');
    expect(mergeAlerts([old], [recent]).map((a) => a.id)).toEqual(['recent', 'old']);
  });

  it('replaces an alert with the copy just read', () => {
    const before = saved('a1', '2026-09-01T00:00:00.000Z');
    const after = saved('a1', '2026-09-01T00:00:00.000Z', 'Rain has eased');
    const merged = mergeAlerts([before], [after]);
    expect(merged).toHaveLength(1);
    expect(merged[0].title).toBe('Rain has eased');
  });

  it('orders every alert newest first', () => {
    const ids = mergeAlerts(
      [saved('b', '2026-05-01T00:00:00.000Z')],
      [saved('c', '2026-09-01T00:00:00.000Z'), saved('a', '2026-01-01T00:00:00.000Z')],
    ).map((a) => a.id);
    expect(ids).toEqual(['c', 'b', 'a']);
  });
});
