import { describe, expect, it } from 'vitest';
import type { Alert } from '../scripts/lib/alerts.ts';
import { duration, incidentStories, storiesBetween } from '../site/lib/lifecycle.ts';

/**
 * Builds a published alert.
 *
 * @param number The register number.
 * @param severity Its severity.
 * @param publishedAt When it was published.
 * @param stages The stages it covers.
 * @param incident The incident it is about.
 * @param status The incident's status when the alert was read.
 * @returns The alert.
 */
function alert(
  number: string,
  severity: string,
  publishedAt: string,
  stages: number[] = [4],
  incident = 'slide',
  status: 'OPEN' | 'CLOSED' = 'OPEN',
): Alert {
  return {
    id: number,
    number,
    severity: { value: severity, label: severity },
    category: { label: 'Weather' },
    incident: { id: incident, number: incident, description: incident, status },
    stages: stages.map((n) => ({ number: n })),
    links: [],
    publishedAt,
    channels: ['WEBSITE', 'APP'],
  } as Alert;
}

describe('incidentStories', () => {
  it('tells a live incident, worst now and opened at its first alert', () => {
    const [story] = incidentStories(
      [
        alert('P1', 'ADVISORY', '2026-09-01T00:00:00Z'),
        alert('P2', 'CLOSED', '2026-09-03T00:00:00Z'),
      ],
      4,
    );
    expect(story).toMatchObject({ state: 'live', severity: 'CLOSED', openedAt: '2026-09-01T00:00:00Z', endedAt: null, liveOn: [4] });
    expect(story.alerts.map((a) => a.number)).toEqual(['P2', 'P1']);
    expect(story.spans.map((s) => s.severity)).toEqual(['ADVISORY', 'CLOSED']);
  });

  it('clears an incident from one stage while it stays live on another', () => {
    const alerts = [
      alert('P1', 'PRECAUTION', '2026-09-01T00:00:00Z', [4, 5]),
      alert('P2', 'OK', '2026-09-05T00:00:00Z', [4]),
    ];
    const [four] = incidentStories(alerts, 4);
    expect(four).toMatchObject({ state: 'cleared', severity: 'PRECAUTION', endedAt: '2026-09-05T00:00:00Z', liveOn: [5] });
    expect(four.spans).toHaveLength(1);
    expect(four.spans[0].to).toBe(Date.parse('2026-09-05T00:00:00Z'));
    expect(incidentStories(alerts, 5)[0].state).toBe('live');
    expect(incidentStories(alerts, null)[0].state).toBe('live');
  });

  it('closes an incident at the OK alert that closed it', () => {
    const [story] = incidentStories(
      [
        alert('P1', 'CLOSED', '2026-09-01T00:00:00Z'),
        alert('P2', 'OK', '2026-09-08T00:00:00Z', [4], 'slide', 'CLOSED'),
      ],
      4,
    );
    expect(story).toMatchObject({ state: 'closed', severity: 'CLOSED', endedAt: '2026-09-08T00:00:00Z', liveOn: [] });
  });

  it('keeps overlapping incidents apart, live ones first and worst first', () => {
    const list = incidentStories(
      [
        alert('P1', 'ADVISORY', '2026-09-01T00:00:00Z', [4], 'rain'),
        alert('P2', 'CLOSED', '2026-09-02T00:00:00Z', [4], 'slide'),
        alert('P3', 'PRECAUTION', '2026-08-01T00:00:00Z', [4], 'elephants'),
        alert('P4', 'OK', '2026-08-10T00:00:00Z', [4], 'elephants', 'CLOSED'),
      ],
      4,
    );
    expect(list.map((s) => [s.incident.id, s.state])).toEqual([
      ['slide', 'live'],
      ['rain', 'live'],
      ['elephants', 'closed'],
    ]);
  });

  it('leaves out incidents with no alert on the stage', () => {
    expect(incidentStories([alert('P1', 'CLOSED', '2026-09-01T00:00:00Z', [7])], 4)).toEqual([]);
  });
});

describe('storiesBetween', () => {
  const all = incidentStories(
    [
      alert('P1', 'PRECAUTION', '2025-12-20T00:00:00Z'),
      alert('P2', 'ADVISORY', '2026-01-10T00:00:00Z'),
      alert('P3', 'CLOSED', '2024-03-01T00:00:00Z', [4], 'old'),
      alert('P4', 'OK', '2024-03-09T00:00:00Z', [4], 'old', 'CLOSED'),
    ],
    4,
  );
  const from = Date.parse('2026-01-01T00:00:00+05:30');
  const to = Date.parse('2026-12-31T23:59:59+05:30');

  it('keeps an incident shown during the window, with only the alerts published in it', () => {
    const [story, ...rest] = storiesBetween(all, from, to);
    expect(rest).toEqual([]);
    expect(story.incident.id).toBe('slide');
    expect(story.alerts.map((a) => a.number)).toEqual(['P2']);
  });

  it('keeps an incident still live from before the window, with no alerts in it', () => {
    const [story] = storiesBetween(all, Date.parse('2026-06-01T00:00:00Z'), Date.parse('2026-06-30T00:00:00Z'));
    expect(story.incident.id).toBe('slide');
    expect(story.alerts).toEqual([]);
  });
});

describe('duration', () => {
  it('counts hours under a day and whole days after', () => {
    expect(duration(0, 3_600_000)).toBe('1 hour');
    expect(duration(0, 5 * 3_600_000)).toBe('5 hours');
    expect(duration(0, 36 * 3_600_000)).toBe('2 days');
    expect(duration(0, 24 * 3_600_000)).toBe('1 day');
  });
});
