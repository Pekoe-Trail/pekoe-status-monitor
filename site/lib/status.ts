import { loadConfig, type SystemConfig } from '../../scripts/lib/config.ts';
import { uptime } from '../../scripts/lib/state.ts';
import { Store } from '../../scripts/lib/store.ts';
import { TIME_ZONE, dayRange, localDay } from '../../scripts/lib/time.ts';
import type { CheckResult, DailyTotals, Status, SystemState } from '../../scripts/lib/types.ts';

export const BAR_DAYS = 90;
const STALE_AFTER_MS = 60 * 60_000;

export type DayLevel = 'none' | 'up' | 'minor' | 'major';
export type Overall = 'operational' | 'degraded' | 'partial' | 'major' | 'unknown';

export interface DayBar {
  day: string;
  level: DayLevel;
  uptime: number | null;
  avgMs: number | null;
}

export interface SystemView {
  config: SystemConfig;
  state: SystemState | undefined;
  /** `unknown` until the first check */
  status: Status | 'unknown';
  bars: DayBar[];
  uptime: { day: number | null; week: number | null; month: number | null; quarter: number | null };
}

const config = loadConfig();
const store = new Store(process.env.STATUS_DATA_DIR ?? 'data');
const current = store.readCurrent();
const today = localDay(new Date());

export const updatedAt = current.updatedAt ? new Date(current.updatedAt) : null;
export const isStale = !updatedAt || Date.now() - updatedAt.getTime() > STALE_AFTER_MS;

/**
 * Grades one day for its uptime bar.
 *
 * @param totals The day's totals, if any checks ran.
 * @returns `none` without checks, `major` below 95% uptime, `minor` with any Down check or
 *   mostly Degraded checks, otherwise `up`.
 */
function dayLevel(totals: DailyTotals | undefined): DayLevel {
  if (!totals || totals.n === 0) return 'none';
  const up = uptime([totals]) ?? 1;
  if (up < 0.95) return 'major';
  if (totals.down > 0 || totals.degraded > totals.n / 2) return 'minor';
  return 'up';
}

/**
 * Reads a system's detailed checks for the last few Sri Lanka days, today included.
 *
 * @param id The system id.
 * @param days How many days to read.
 * @returns The checks, oldest first.
 */
export function recentChecks(id: string, days: number): CheckResult[] {
  return dayRange(today, days).flatMap((day) => store.readChecks(id, day));
}

/**
 * Builds what the page shows for one system: its state, 90 days of bars, and uptime over
 * the last 24 hours, 7, 30 and 90 days.
 *
 * @param system The system's config.
 * @returns The system's view.
 */
function view(system: SystemConfig): SystemView {
  const daily = store.readDaily(system.id);
  const days = dayRange(today, BAR_DAYS);
  /**
   * Collects the daily totals of the last `n` days that had checks.
   *
   * @param n How many days back to go.
   * @returns The totals of those days.
   */
  const since = (n: number) => days.slice(-n).map((d) => daily[d]).filter(Boolean) as DailyTotals[];
  const lastDay = Date.now() - 24 * 60 * 60_000;
  const dayChecks = recentChecks(system.id, 2).filter((c) => Date.parse(c.t) >= lastDay);
  const state = current.systems[system.id];

  return {
    config: system,
    state,
    status: state?.status ?? 'unknown',
    bars: days.map((day) => {
      const totals = daily[day];
      const passed = totals ? totals.n - totals.down : 0;
      return {
        day,
        level: dayLevel(totals),
        uptime: totals ? uptime([totals]) : null,
        avgMs: totals && passed > 0 ? Math.round(totals.ms / passed) : null,
      };
    }),
    uptime: {
      day: uptime(dayChecks.map((c) => ({ n: 1, down: c.s === 'down' ? 1 : 0 }))),
      week: uptime(since(7)),
      month: uptime(since(30)),
      quarter: uptime(since(BAR_DAYS)),
    },
  };
}

export const systems: SystemView[] = config.systems.map(view);

/**
 * Finds a system's view by id.
 *
 * @param id The system id.
 * @returns The view, or undefined when no system has that id.
 */
export function systemById(id: string): SystemView | undefined {
  return systems.find((s) => s.config.id === id);
}

export const groups: [string, SystemView[]][] = [
  ...Map.groupBy(systems, (s) => s.config.group),
];

export const overall: Overall = (() => {
  if (systems.every((s) => s.status === 'unknown')) return 'unknown';
  const down = systems.filter((s) => s.status === 'down');
  if (down.some((s) => s.config.critical)) return 'major';
  if (down.length > 0) return 'partial';
  if (systems.some((s) => s.status === 'degraded')) return 'degraded';
  return 'operational';
})();

export const OVERALL_TEXT: Record<Overall, string> = {
  operational: 'All systems operational',
  degraded: 'Some systems are slow',
  partial: 'Partial outage',
  major: 'Major outage',
  unknown: 'Status not yet available',
};

export const STATUS_TEXT: Record<Status | 'unknown', string> = {
  up: 'Operational',
  degraded: 'Slow',
  down: 'Down',
  unknown: 'No data yet',
};

const dateTime = new Intl.DateTimeFormat('en-GB', {
  timeZone: TIME_ZONE,
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});
const dateOnly = new Intl.DateTimeFormat('en-GB', {
  timeZone: TIME_ZONE,
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

/**
 * Formats a date and time in Sri Lanka time.
 *
 * @param d The instant.
 * @returns Text such as "21 Sep 2026, 14:07".
 */
export const formatDateTime = (d: Date) => dateTime.format(d);
/**
 * Formats a date in Sri Lanka time.
 *
 * @param d A `YYYY-MM-DD` day or a Date.
 * @returns Text such as "21 Sep 2026".
 */
export const formatDate = (d: Date | string) =>
  dateOnly.format(typeof d === 'string' ? new Date(`${d}T12:00:00+05:30`) : d);

/**
 * Formats an uptime share as a percentage with two decimals, or "100%" exactly.
 *
 * @param value A fraction from 0 to 1, or null when there were no checks.
 * @returns The percentage, or "–" for null.
 */
export function formatPercent(value: number | null): string {
  if (value === null) return '–';
  const pct = value * 100;
  return pct === 100 ? '100%' : `${pct.toFixed(2)}%`;
}

