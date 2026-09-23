import { describe, expect, it } from 'vitest';
import { yearWeeks } from '../site/lib/year.ts';

/**
 * Finds one day's cell.
 *
 * @param weeks The laid-out weeks.
 * @param day The date as `YYYY-MM-DD`.
 * @returns The cell, or undefined when the day isn't shown.
 */
const cell = (weeks: ReturnType<typeof yearWeeks>, day: string) =>
  weeks.flatMap((w) => w.days).find((c) => c?.day === day);

describe('yearWeeks', () => {
  it('lays out the window in Sunday-first weeks, padding the first one', () => {
    const weeks = yearWeeks([], '2025-09-23', '2026-09-22');
    expect(weeks[0].days.slice(0, 3).map((c) => c?.day ?? null)).toEqual([null, null, '2025-09-23']);
    expect(weeks.flatMap((w) => w.days).filter(Boolean)).toHaveLength(365);
    expect(weeks.at(-1)!.days.at(-1)!.day).toBe('2026-09-22');
    expect(weeks.find((w) => w.month === 'Jan')!.days.some((c) => c?.day === '2026-01-01')).toBe(true);
  });

  it('lays out a calendar year on its own', () => {
    const weeks = yearWeeks([], '2025-01-01', '2025-12-31');
    expect(weeks.flatMap((w) => w.days).filter(Boolean)).toHaveLength(365);
    expect(weeks[0].days.find(Boolean)!.day).toBe('2025-01-01');
    expect(weeks.at(-1)!.days.filter(Boolean).at(-1)!.day).toBe('2025-12-31');
  });

  it('returns nothing when the window is empty', () => {
    expect(yearWeeks([], '2026-01-01', '2025-12-31')).toEqual([]);
  });

  it('colours the days given and shows every other day as open', () => {
    const weeks = yearWeeks(
      [{ date: '2026-09-12', severity: 'CLOSED', alerts: ['PSA-0003', 'PSA-0012'] }],
      '2026-09-01',
      '2026-09-22',
    );
    expect(cell(weeks, '2026-09-12')).toEqual({
      day: '2026-09-12',
      severity: 'CLOSED',
      alerts: ['PSA-0003', 'PSA-0012'],
      anchor: null,
    });
    expect(cell(weeks, '2026-09-13')).toEqual({ day: '2026-09-13', severity: 'OK', alerts: [], anchor: null });
  });

  it('links each day to the last timeline entry made by its end, Sri Lanka time', () => {
    const weeks = yearWeeks([], '2026-09-10', '2026-09-22', [
      { at: Date.parse('2026-09-14T06:00:00.000Z'), anchor: 'resolved' },
      { at: Date.parse('2026-09-10T20:00:00.000Z'), anchor: 'published' },
      { at: Date.parse('2026-09-12T06:00:00.000Z'), anchor: 'updated' },
    ]);
    const anchor = (day: string) => cell(weeks, day)!.anchor;
    expect(anchor('2026-09-10')).toBeNull();
    expect(anchor('2026-09-11')).toBe('published');
    expect(anchor('2026-09-13')).toBe('updated');
    expect(anchor('2026-09-22')).toBe('resolved');
  });
});
