import { describe, expect, it } from 'vitest';
import type { Alert } from '../scripts/lib/alerts.ts';
import { days, stageDays } from '../site/lib/calendar.ts';

type Step = [kind: 'PUBLISHED' | 'UPDATED' | 'CLOSED', severity: string, at: string, channels?: string[]];

/**
 * Builds an alert with the given updates.
 *
 * @param number The register number.
 * @param steps Each update's kind, severity, time and channels; website and app by default.
 * @param closedAt When it was resolved, or null while open.
 * @param stages The stages it covers; empty for an all-stages alert.
 * @returns The alert.
 */
function alert(number: string, steps: Step[], closedAt: string | null = null, stages: number[] = [4]): Alert {
  return {
    id: number,
    number,
    scope: stages.length === 0 ? 'GLOBAL' : 'STAGE',
    status: closedAt ? 'CLOSED' : 'OPEN',
    severity: { value: steps.at(-1)![1], label: steps.at(-1)![1] },
    category: { label: 'Weather' },
    stages: stages.map((n) => ({ number: n })),
    publishedAt: steps[0][2],
    updatedAt: steps.at(-1)![2],
    closedAt,
    history: steps.map(([kind, value, createdAt, channels = ['WEBSITE', 'APP']]) => ({
      kind,
      severity: { value, label: value },
      createdAt,
      channels,
    })),
  } as unknown as Alert;
}

const now = Date.parse('2026-09-22T12:00:00.000Z');
const colours = (alerts: Alert[], from: string, to: string) =>
  Object.fromEntries(stageDays(alerts, days(from, to), now).map((d) => [d.date, d.severity]));

describe('stageDays', () => {
  it('carries a colour over until a website update changes it, then leaves the stage open', () => {
    const psa = alert(
      'PSA-0010',
      [
        ['PUBLISHED', 'CLOSED', '2026-09-10T20:00:00.000Z'],
        ['UPDATED', 'PRECAUTION', '2026-09-13T06:00:00.000Z'],
        ['CLOSED', 'OK', '2026-09-15T06:00:00.000Z'],
      ],
      '2026-09-15T06:00:00.000Z',
    );
    expect(colours([psa], '2026-09-09', '2026-09-17')).toEqual({
      '2026-09-11': 'CLOSED',
      '2026-09-12': 'CLOSED',
      '2026-09-13': 'PRECAUTION',
      '2026-09-14': 'PRECAUTION',
    });
  });

  it('ignores a step that was not sent to the website, such as a push-only reminder', () => {
    const psa = alert('PSA-0011', [
      ['PUBLISHED', 'ADVISORY', '2026-09-10T06:00:00.000Z'],
      ['UPDATED', 'CLOSED', '2026-09-12T06:00:00.000Z', ['PUSH']],
    ]);
    expect(colours([psa], '2026-09-11', '2026-09-13')).toEqual({
      '2026-09-11': 'ADVISORY',
      '2026-09-12': 'ADVISORY',
      '2026-09-13': 'ADVISORY',
    });
  });

  it('never colours an alert that went nowhere near the website', () => {
    const psa = alert('PSA-0012', [['PUBLISHED', 'CLOSED', '2026-09-10T06:00:00.000Z', ['PUSH', 'EMAIL']]]);
    expect(colours([psa], '2026-09-10', '2026-09-13')).toEqual({});
  });

  it('keeps an open alert running to today and no further', () => {
    const psa = alert('PSA-0013', [['PUBLISHED', 'PRECAUTION', '2026-09-20T06:00:00.000Z']]);
    expect(colours([psa], '2026-09-19', '2026-09-24')).toEqual({
      '2026-09-20': 'PRECAUTION',
      '2026-09-21': 'PRECAUTION',
      '2026-09-22': 'PRECAUTION',
    });
  });

  it('shows the worst of the alerts open that day, and lists them all', () => {
    const one = alert('PSA-0020', [['PUBLISHED', 'ADVISORY', '2026-09-10T06:00:00.000Z']]);
    const two = alert('PSA-0021', [['PUBLISHED', 'PRECAUTION', '2026-09-10T06:00:00.000Z']], null, []);
    const [day] = stageDays([one, two], days('2026-09-11', '2026-09-11'), now);
    expect(day).toEqual({ date: '2026-09-11', severity: 'PRECAUTION', alerts: ['PSA-0020', 'PSA-0021'] });
  });
});
