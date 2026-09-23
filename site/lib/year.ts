import type { Severity } from '../../scripts/lib/alerts.ts';
import { addDays } from '../../scripts/lib/time.ts';
import { days, type DayColour } from './calendar.ts';

/** Days in the rolling window the stage page opens on */
export const YEAR_DAYS = 365;

export interface YearCell {
  /** The Sri Lanka calendar date, as `YYYY-MM-DD` */
  day: string;
  /** The stage's colour at the end of the day, as the website and app showed it */
  severity: Severity;
  /** The numbers of the alerts open at the end of the day, such as `PSA-0042` */
  alerts: string[];
  /** The timeline entry that set the day's colour: the last update by the end of the day */
  anchor: string | null;
}

export interface YearMark {
  /** When the update was made, in milliseconds */
  at: number;
  /** Its timeline entry's element id */
  anchor: string;
}

export interface YearWeek {
  /** Seven days, Sunday first; null pads the first week before the window starts */
  days: (YearCell | null)[];
  /** The month's short name when a month starts in this week, for the label above it */
  month: string | null;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Lays out a stretch of a stage's calendar as weeks of days, like a contribution graph. Each
 * day shows the stage's colour at its end, which carries over until a website update changes
 * it; a day left out of `colours` ended Open, with no alert open.
 *
 * @param colours The stage's days that ended with an alert open.
 * @param from The first day to show, as `YYYY-MM-DD`.
 * @param to The last day to show, as `YYYY-MM-DD`.
 * @param marks The stage's timeline entries, in any order, for each day to link to the last
 *   one made by its end.
 * @returns The weeks, oldest first, each Sunday to Saturday. The last week stops at `to`.
 */
export function yearWeeks(
  colours: DayColour[],
  from: string,
  to: string,
  marks: YearMark[] = [],
): YearWeek[] {
  const byDate = new Map(colours.map((d) => [d.date, d]));
  const sorted = [...marks].sort((a, b) => a.at - b.at);
  let next = 0;
  let anchor: string | null = null;
  const range = days(from, to);
  if (range.length === 0) return [];
  const lead = new Date(`${range[0]}T00:00:00Z`).getUTCDay();
  const cells: (YearCell | null)[] = [
    ...Array.from({ length: lead }, () => null),
    ...range.map((day) => {
      const end = Date.parse(`${addDays(day, 1)}T00:00:00+05:30`);
      while (next < sorted.length && sorted[next].at < end) anchor = sorted[next++].anchor;
      const found = byDate.get(day);
      return { day, severity: found?.severity ?? 'OK', alerts: found?.alerts ?? [], anchor };
    }),
  ];
  const weeks: YearWeek[] = [];
  for (let i = 0; i < cells.length; i += 7) {
    const week = cells.slice(i, i + 7);
    const first = week.find((cell) => cell && cell.day.endsWith('-01'));
    weeks.push({ days: week, month: first ? MONTHS[Number(first.day.slice(5, 7)) - 1] : null });
  }
  return weeks;
}
