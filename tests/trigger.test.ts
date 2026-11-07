import { afterEach, describe, expect, it, vi } from 'vitest';
import trigger, { formatStallMessage, reportsErrorsNow, stallAlert, stuckRuns } from '../worker/trigger.js';

const NOW = Date.parse('2026-11-07T12:00:30Z');
const ago = (minutes: number) => new Date(NOW - minutes * 60_000).toISOString();
const run = (id: number, minutes: number, status = 'in_progress') => ({
  id,
  status,
  created_at: ago(minutes),
  updated_at: ago(minutes),
});

describe('stuck runs', () => {
  it('picks runs open longer than 20 minutes', () => {
    const runs = [run(1, 5), run(2, 21, 'queued'), run(3, 458 * 60)];
    expect(stuckRuns(runs, NOW).map((r) => r.id)).toEqual([2, 3]);
  });
});

describe('stall alert', () => {
  it('stays quiet while checks succeed', () => {
    expect(stallAlert([ago(9), ago(19)], NOW)).toBeNull();
  });

  it('sends once when the last success crosses 40 minutes', () => {
    expect(stallAlert([ago(39)], NOW)).toBeNull();
    expect(stallAlert([ago(45)], NOW)).toBe('stalled');
    expect(stallAlert([ago(55)], NOW)).toBeNull();
  });

  it('repeats every six hours while stalled', () => {
    expect(stallAlert([ago(40 + 360 + 3)], NOW)).toBe('stalled');
    expect(stallAlert([ago(40 + 360 + 13)], NOW)).toBeNull();
  });

  it('sends resumed on the first tick after a success that ends a stall', () => {
    expect(stallAlert([ago(9), ago(9 + 60)], NOW)).toBe('resumed');
    expect(stallAlert([ago(19), ago(19 + 60)], NOW)).toBeNull();
  });

  it('needs at least one success to say anything', () => {
    expect(stallAlert([], NOW)).toBeNull();
  });
});

describe('stall message', () => {
  it('gives the age in minutes, or hours when long', () => {
    expect(formatStallMessage('stalled', ago(45), NOW)).toContain('for 45 minutes');
    expect(formatStallMessage('stalled', ago(400), NOW)).toContain('for 7 hours');
    expect(formatStallMessage('resumed', ago(60), NOW)).toMatch(/^✅ Status checks have RESUMED/);
  });
});

describe('error reports', () => {
  it('fire on the first tick of each six-hour block only', () => {
    expect(reportsErrorsNow(Date.parse('2026-11-07T06:00:30Z'))).toBe(true);
    expect(reportsErrorsNow(Date.parse('2026-11-07T06:10:30Z'))).toBe(false);
    expect(reportsErrorsNow(Date.parse('2026-11-07T07:00:30Z'))).toBe(false);
  });
});

describe('scheduled run', () => {
  afterEach(() => vi.unstubAllGlobals());

  /**
   * Replaces fetch with a GitHub API in which run 7 has been open for 30 hours.
   *
   * @param dispatchStatus The HTTP status the dispatch call answers with.
   * @returns Every call made, by URL and method, in order.
   */
  function stubFetch(dispatchStatus = 204) {
    const calls: { url: string; method: string }[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit = {}) => {
        calls.push({ url, method: init.method ?? 'GET' });
        if (url.includes('status=in_progress')) return Response.json({ workflow_runs: [run(7, 30 * 60), run(8, 1)] });
        if (url.includes('status=success')) return Response.json({ workflow_runs: [run(9, 5), run(10, 15)] });
        if (url.includes('/runs?')) return Response.json({ workflow_runs: [] });
        if (url.endsWith('/dispatches')) return new Response(null, { status: dispatchStatus });
        return new Response(null, { status: 202 });
      }),
    );
    return calls;
  }

  it('cancels the stuck run, then dispatches the check', async () => {
    vi.useFakeTimers({ now: NOW });
    const calls = stubFetch();
    await trigger.scheduled({}, { GITHUB_TOKEN: 't', TELEGRAM_BOT_TOKEN: 'b', TELEGRAM_CHAT_ID: 'c' });
    vi.useRealTimers();

    const posts = calls.filter((c) => c.method === 'POST').map((c) => c.url.replace(/^.*\/repos\/[^/]+\/[^/]+/, ''));
    expect(posts).toEqual(['/actions/runs/7/force-cancel', '/actions/workflows/check.yml/dispatches']);
  });

  it('still reports a failed dispatch as an error', async () => {
    vi.useFakeTimers({ now: NOW });
    stubFetch(401);
    await expect(trigger.scheduled({}, { GITHUB_TOKEN: 't' })).rejects.toThrow('Dispatch: GitHub answered 401');
    vi.useRealTimers();
  });
});
