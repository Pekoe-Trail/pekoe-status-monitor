import type { CheckResult, DailyFile, SystemState } from './types.ts';

export type Transition = { kind: 'down' } | { kind: 'recovered'; downtimeMs: number } | null;

/**
 * Works out a system's new state from its previous state and the latest check, and whether
 * developers must be told. Down is only reported after `confirmAfter` failed checks in a
 * row; recovery is reported on the first passing check after that.
 *
 * @param prev The state saved after the previous run; undefined for a new system.
 * @param result The latest check.
 * @param confirmAfter Consecutive Down checks needed before Down is reported.
 * @returns The new state, and the transition to notify, or null when nothing changed.
 */
export function nextState(
  prev: SystemState | undefined,
  result: CheckResult,
  confirmAfter: number,
): { state: SystemState; transition: Transition } {
  const down = result.s === 'down';
  const failStreak = down ? (prev?.failStreak ?? 0) + 1 : 0;
  const state: SystemState = {
    status: result.s,
    checkedAt: result.t,
    ms: result.ms,
    ...(result.code !== undefined && { code: result.code }),
    ...(result.err && { err: result.err }),
    failStreak,
    ...(down && { downSince: prev?.downSince ?? result.t }),
    alerted: prev?.alerted ?? false,
  };

  if (down && !state.alerted && failStreak >= confirmAfter) {
    state.alerted = true;
    return { state, transition: { kind: 'down' } };
  }
  if (!down && state.alerted) {
    const since = prev?.downSince ? Date.parse(prev.downSince) : Date.parse(result.t);
    state.alerted = false;
    return { state, transition: { kind: 'recovered', downtimeMs: Date.parse(result.t) - since } };
  }
  return { state, transition: null };
}

/**
 * Adds one check to a day's totals. Only passing checks add to the response-time sum.
 *
 * @param daily The system's daily totals.
 * @param day The check's Sri Lanka date, as `YYYY-MM-DD`.
 * @param result The check to add.
 * @returns A copy of `daily` with that day's totals updated.
 */
export function addToDaily(daily: DailyFile, day: string, result: CheckResult): DailyFile {
  const totals = daily[day] ?? { n: 0, up: 0, degraded: 0, down: 0, ms: 0 };
  totals.n += 1;
  totals[result.s] += 1;
  if (result.s !== 'down') totals.ms += result.ms;
  return { ...daily, [day]: totals };
}

/**
 * Works out the share of checks that passed, counting Degraded as passing.
 *
 * @param totals The daily totals to include.
 * @returns A fraction from 0 to 1, or null when there were no checks.
 */
export function uptime(totals: { n: number; down: number }[]): number | null {
  const n = totals.reduce((sum, t) => sum + t.n, 0);
  if (n === 0) return null;
  const down = totals.reduce((sum, t) => sum + t.down, 0);
  return (n - down) / n;
}

/**
 * Formats a duration for a notification, rounded to the minute.
 *
 * @param ms The duration in milliseconds.
 * @returns Text such as "1 h 5 min", "12 min" or "under a minute".
 */
export function formatDuration(ms: number): string {
  const minutes = Math.round(ms / 60_000);
  if (minutes < 1) return 'under a minute';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}
