import { describe, expect, it } from 'vitest';
import type { Alert } from '../scripts/lib/alerts.ts';
import { days, stageDays } from '../site/lib/calendar.ts';

/**
 * Builds a published alert.
 *
 * @param number The register number.
 * @param severity Its severity.
 * @param publishedAt When it was published.
 * @param channels The channels it went out on; website and app by default.
 * @param stages The stages it covers.
 * @param incident The incident it is about.
 * @returns The alert.
 */
function alert(
  number: string,
  severity: string,
  publishedAt: string,
  channels: string[] = ['WEBSITE', 'APP'],
  stages: number[] = [4],
  incident = 'slide',
): Alert {
  return {
    id: number,
    number,
    severity: { value: severity, label: severity },
    category: { label: 'Weather' },
    incident: { id: incident, number: incident, description: incident, status: 'OPEN' },
    stages: stages.map((n) => ({ number: n })),
    publishedAt,
    channels,
  } as unknown as Alert;
}

const now = Date.parse('2026-09-22T12:00:00.000Z');
const colours = (alerts: Alert[], from: string, to: string, stage: number | null = 4) =>
  Object.fromEntries(stageDays(alerts, days(from, to), stage, now).map((d) => [d.date, d.severity]));

describe('stageDays', () => {
  it('carries a colour over until a newer alert changes it, and a Green one leaves the stage open', () => {
    const published = [
      alert('PSA-0010', 'CLOSED', '2026-09-10T20:00:00.000Z'),
      alert('PSA-0011', 'PRECAUTION', '2026-09-13T06:00:00.000Z'),
      alert('PSA-0012', 'OK', '2026-09-15T06:00:00.000Z'),
    ];
    expect(colours(published, '2026-09-09', '2026-09-17')).toEqual({
      '2026-09-11': 'CLOSED',
      '2026-09-12': 'CLOSED',
      '2026-09-13': 'PRECAUTION',
      '2026-09-14': 'PRECAUTION',
    });
  });

  it('ignores an alert that was not sent to the website, such as a push-only reminder', () => {
    const published = [
      alert('PSA-0013', 'ADVISORY', '2026-09-10T06:00:00.000Z'),
      alert('PSA-0014', 'CLOSED', '2026-09-12T06:00:00.000Z', ['PUSH']),
    ];
    expect(colours(published, '2026-09-11', '2026-09-13')).toEqual({
      '2026-09-11': 'ADVISORY',
      '2026-09-12': 'ADVISORY',
      '2026-09-13': 'ADVISORY',
    });
  });

  it('never colours an alert that went nowhere near the website', () => {
    const published = [alert('PSA-0015', 'CLOSED', '2026-09-10T06:00:00.000Z', ['PUSH', 'EMAIL'])];
    expect(colours(published, '2026-09-10', '2026-09-13')).toEqual({});
  });

  it('keeps the newest alert running to today and no further', () => {
    const published = [alert('PSA-0016', 'PRECAUTION', '2026-09-20T06:00:00.000Z')];
    expect(colours(published, '2026-09-19', '2026-09-24')).toEqual({
      '2026-09-20': 'PRECAUTION',
      '2026-09-21': 'PRECAUTION',
      '2026-09-22': 'PRECAUTION',
    });
  });

  it('shows the worst of overlapping incidents, and lists both', () => {
    const slide = alert('PSA-0020', 'ADVISORY', '2026-09-10T06:00:00.000Z');
    const cyclone = alert('PSA-0021', 'PRECAUTION', '2026-09-10T06:00:00.000Z', ['WEBSITE'], [4, 5], 'cyclone');
    const [day] = stageDays([slide, cyclone], days('2026-09-11', '2026-09-11'), 4, now);
    expect(day).toEqual({ date: '2026-09-11', severity: 'PRECAUTION', alerts: ['PSA-0020', 'PSA-0021'] });
  });

  it("keeps one incident's colour when another incident on the stage clears", () => {
    const published = [
      alert('PSA-0030', 'CLOSED', '2026-09-10T06:00:00.000Z', ['WEBSITE'], [4, 5], 'cyclone'),
      alert('PSA-0031', 'ADVISORY', '2026-09-10T08:00:00.000Z'),
      alert('PSA-0032', 'OK', '2026-09-12T06:00:00.000Z'),
    ];
    expect(colours(published, '2026-09-11', '2026-09-12')).toEqual({
      '2026-09-11': 'CLOSED',
      '2026-09-12': 'CLOSED',
    });
  });

  it("doesn't let an alert on another stage replace this stage's colour", () => {
    const published = [
      alert('PSA-0040', 'CLOSED', '2026-09-10T06:00:00.000Z', ['WEBSITE'], [4, 5]),
      alert('PSA-0041', 'OK', '2026-09-12T06:00:00.000Z', ['WEBSITE'], [5]),
    ];
    expect(colours(published, '2026-09-12', '2026-09-12', 4)).toEqual({ '2026-09-12': 'CLOSED' });
    expect(colours(published, '2026-09-12', '2026-09-12', 5)).toEqual({});
    expect(colours(published, '2026-09-12', '2026-09-12', null)).toEqual({ '2026-09-12': 'CLOSED' });
  });
});
