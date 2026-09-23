import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  fetchAlerts,
  lastUpdatedAt,
  mergeAlerts,
  openAlerts,
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
    number: 'PSA-0001',
    scope: 'GLOBAL',
    status: 'OPEN',
    severity: { value: 'ADVISORY', rank: 1, label: 'Advisory', hex: '#FBC02D' },
    category: { value: 'WEATHER_LANDSLIDES', label: 'Weather & Landslides' },
    reason: 'Landslide risk after heavy rain',
    title: 'Heavy rain across the trail',
    impact: 'Paths are slippery.',
    action: 'Wear good boots.',
    link: null,
    linkLabel: null,
    reviewAt: null,
    stages: [],
    translations: [{ localeId: 'en', title: 'Heavy rain across the trail' }],
    publishedAt: '2026-09-20T03:30:00.000Z',
    updatedAt: '2026-09-20T03:30:00.000Z',
    closedAt: null,
    resolution: null,
    history: [
      {
        kind: 'PUBLISHED',
        severity: { value: 'ADVISORY', label: 'Advisory' },
        reviewAt: null,
        createdAt: '2026-09-20T03:30:00.000Z',
        title: 'Heavy rain across the trail',
        message: null,
        channels: ['WEBSITE', 'APP', 'PUSH'],
      },
    ],
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
    expect(alerts[0].severity).toEqual({ value: 'ADVISORY', label: 'Advisory' });
  });

  it('keeps each update\'s channels in order, dropping ones it does not know', () => {
    const step = { ...psa().history[0], channels: ['EMAIL', 'SMS', 'WEBSITE'] };
    const { alerts } = parsePage(body([psa({ history: [step] }), psa({ id: 'a2', history: [{ ...step, channels: undefined }] })]));
    expect(alerts.map((a) => a.history[0].channels)).toEqual([['WEBSITE', 'EMAIL'], []]);
  });

  it('skips an alert with an unexpected shape', () => {
    const { alerts } = parsePage(body([psa(), psa({ id: 'a2', severity: { value: 'PURPLE', label: 'x' } })]));
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
      const item = psa({ id: `p${n}`, link: n === 1 ? 'http://example.com' : 'https://example.com' });
      return new Response(JSON.stringify(body([item], n + 1)));
    });
    vi.stubGlobal('fetch', fetch);

    const alerts = await fetchAlerts('https://api.example.com/v1/alerts/public/global/history', {
      timeoutMs: 1000,
      maxPages: 2,
    });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[0][0].searchParams.get('perPage')).toBe('50');
    expect(alerts.map((a) => [a.id, a.link])).toEqual([
      ['p1', null],
      ['p2', 'https://example.com'],
    ]);
  });

  it('asks only for the alerts changed since the watermark', async () => {
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

describe('openAlerts', () => {
  it('lists open alerts, most severe first, then most recently updated', () => {
    const { alerts } = parsePage(
      body([
        psa({ id: 'old-advisory', updatedAt: '2026-09-01T00:00:00Z' }),
        psa({ id: 'closure', severity: { value: 'CLOSED', label: 'Closed' } }),
        psa({ id: 'new-advisory', updatedAt: '2026-09-21T00:00:00Z' }),
        psa({ id: 'done', status: 'CLOSED', severity: { value: 'CLOSED', label: 'Closed' } }),
      ]),
    );
    expect(openAlerts(alerts as Alert[]).map((a) => a.id)).toEqual(['closure', 'new-advisory', 'old-advisory']);
  });
});

describe('lastUpdatedAt', () => {
  const at = (id: string, updatedAt: string) => ({ ...psa({ id, updatedAt }) }) as unknown as Alert;

  it('takes the newest change in the archive, whatever the order', () => {
    expect(
      lastUpdatedAt([
        at('a', '2026-09-20T06:00:00.000Z'),
        at('b', '2026-09-23T04:30:00.000Z'),
        at('c', '2026-01-01T00:00:00.000Z'),
      ]),
    ).toBe('2026-09-23T04:30:00.000Z');
  });

  it('has no watermark for an empty archive', () => {
    expect(lastUpdatedAt([])).toBeUndefined();
  });
});

describe('mergeAlerts', () => {
  const saved = (id: string, publishedAt: string, status = 'OPEN') =>
    ({ ...psa({ id, publishedAt, status }), severity: { value: 'ADVISORY', label: 'Advisory' } }) as unknown as Alert;

  it('keeps alerts the read no longer reaches', () => {
    const old = saved('old', '2025-01-01T00:00:00.000Z');
    const recent = saved('recent', '2026-09-01T00:00:00.000Z');
    expect(mergeAlerts([old], [recent]).map((a) => a.id)).toEqual(['recent', 'old']);
  });

  it('replaces an alert with the copy just read', () => {
    const before = saved('a1', '2026-09-01T00:00:00.000Z');
    const after = saved('a1', '2026-09-01T00:00:00.000Z', 'CLOSED');
    const merged = mergeAlerts([before], [after]);
    expect(merged).toHaveLength(1);
    expect(merged[0].status).toBe('CLOSED');
  });

  it('orders every alert newest first', () => {
    const ids = mergeAlerts(
      [saved('b', '2026-05-01T00:00:00.000Z')],
      [saved('c', '2026-09-01T00:00:00.000Z'), saved('a', '2026-01-01T00:00:00.000Z')],
    ).map((a) => a.id);
    expect(ids).toEqual(['c', 'b', 'a']);
  });
});
