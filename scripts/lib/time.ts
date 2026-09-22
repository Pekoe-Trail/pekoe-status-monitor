export const TIME_ZONE = 'Asia/Colombo';

const dayFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/**
 * Gives the Sri Lanka calendar date of an instant, so a day's uptime bar matches the
 * local calendar.
 *
 * @param date The instant.
 * @returns The date as `YYYY-MM-DD`.
 */
export function localDay(date: Date): string {
  return dayFormat.format(date);
}

/**
 * Moves a calendar date by a number of days.
 *
 * @param day The date as `YYYY-MM-DD`.
 * @param delta Days to add; negative to go back.
 * @returns The new date as `YYYY-MM-DD`.
 */
export function addDays(day: string, delta: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

/**
 * Lists the days of a window ending on a given day.
 *
 * @param lastDay The last day, as `YYYY-MM-DD`.
 * @param count How many days to list.
 * @returns The `count` days ending with `lastDay`, oldest first.
 */
export function dayRange(lastDay: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => addDays(lastDay, i - count + 1));
}
