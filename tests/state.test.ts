import { describe, expect, it } from 'vitest';
import { addToDaily, formatDuration, nextState, uptime } from '../scripts/lib/state.ts';
import type { CheckResult, SystemState } from '../scripts/lib/types.ts';

/**
 * Builds a passing check.
 *
 * @param t The check's ISO time.
 * @returns An Up check with HTTP 200.
 */
const up = (t: string): CheckResult => ({ t, s: 'up', ms: 300, code: 200 });
/**
 * Builds a failed check.
 *
 * @param t The check's ISO time.
 * @returns A Down check that timed out.
 */
const down = (t: string): CheckResult => ({ t, s: 'down', ms: 15000, err: 'timeout' });

/**
 * Feeds checks through nextState in order, as successive runs would.
 *
 * @param checks The checks, oldest first.
 * @param confirmAfter Consecutive Down checks needed before Down is reported.
 * @returns The final state, and each run's transition kind or null.
 */
function run(checks: CheckResult[], confirmAfter = 2) {
  let state: SystemState | undefined;
  const transitions = [];
  for (const check of checks) {
    const next = nextState(state, check, confirmAfter);
    state = next.state;
    transitions.push(next.transition?.kind ?? null);
  }
  return { state: state!, transitions };
}

describe('nextState', () => {
  it('ignores a single failed check', () => {
    const { transitions, state } = run([up('2026-09-21T00:00:00Z'), down('2026-09-21T00:10:00Z'), up('2026-09-21T00:20:00Z')]);
    expect(transitions).toEqual([null, null, null]);
    expect(state.alerted).toBe(false);
  });

  it('reports Down once, after confirmAfter failures in a row', () => {
    const { transitions, state } = run([
      down('2026-09-21T00:00:00Z'),
      down('2026-09-21T00:10:00Z'),
      down('2026-09-21T00:20:00Z'),
    ]);
    expect(transitions).toEqual([null, 'down', null]);
    expect(state.failStreak).toBe(3);
    expect(state.downSince).toBe('2026-09-21T00:00:00Z');
  });

  it('reports recovery with the downtime from the first failed check', () => {
    let state: SystemState | undefined;
    for (const c of [down('2026-09-21T00:00:00Z'), down('2026-09-21T00:10:00Z')]) {
      state = nextState(state, c, 2).state;
    }
    const { state: after, transition } = nextState(state, up('2026-09-21T00:45:00Z'), 2);
    expect(transition).toEqual({ kind: 'recovered', downtimeMs: 45 * 60_000 });
    expect(after.alerted).toBe(false);
    expect(after.failStreak).toBe(0);
    expect(after.downSince).toBeUndefined();
  });

  it('does not report recovery when Down was never reported', () => {
    const { transitions } = run([down('2026-09-21T00:00:00Z'), up('2026-09-21T00:10:00Z')]);
    expect(transitions).toEqual([null, null]);
  });

  it('counts Degraded as passing', () => {
    const { transitions } = run([
      down('2026-09-21T00:00:00Z'),
      down('2026-09-21T00:10:00Z'),
      { t: '2026-09-21T00:20:00Z', s: 'degraded', ms: 5000, code: 200 },
    ]);
    expect(transitions).toEqual([null, 'down', 'recovered']);
  });
});

describe('daily totals and uptime', () => {
  it('adds checks to the right day and averages only passing checks', () => {
    let daily = {};
    daily = addToDaily(daily, '2026-09-21', up('2026-09-21T00:00:00Z'));
    daily = addToDaily(daily, '2026-09-21', down('2026-09-21T00:10:00Z'));
    daily = addToDaily(daily, '2026-09-22', up('2026-09-21T20:00:00Z'));
    expect(daily).toEqual({
      '2026-09-21': { n: 2, up: 1, degraded: 0, down: 1, ms: 300 },
      '2026-09-22': { n: 1, up: 1, degraded: 0, down: 0, ms: 300 },
    });
  });

  it('computes uptime across days, and null without data', () => {
    expect(uptime([{ n: 144, down: 0 }, { n: 144, down: 72 }])).toBe(0.75);
    expect(uptime([])).toBeNull();
  });
});

describe('formatDuration', () => {
  it.each([
    [20_000, 'under a minute'],
    [12 * 60_000, '12 min'],
    [60 * 60_000, '1 h'],
    [65 * 60_000, '1 h 5 min'],
  ])('%i ms → %s', (ms, text) => expect(formatDuration(ms)).toBe(text));
});
