// @ts-check

const API = 'https://api.github.com/repos/Pekoe-Trail/pekoe-status-monitor';
const WORKFLOW = 'check.yml';
const SITE_URL = 'https://status.thepekoetrail.org';

export const STUCK_MINUTES = 20;
export const STALE_MINUTES = 40;
export const REMIND_MINUTES = 360;
export const TICK_MINUTES = 10;

const OPEN_STATUSES = ['queued', 'in_progress', 'waiting', 'pending', 'requested'];

/**
 * @typedef {{ GITHUB_TOKEN: string, TELEGRAM_BOT_TOKEN?: string, TELEGRAM_CHAT_ID?: string }} Env
 * @typedef {{ id: number, status: string, created_at: string, updated_at: string }} Run
 */

/**
 * Picks the check runs open longer than STUCK_MINUTES, which are stuck rather than slow.
 *
 * @param {Run[]} runs Open runs of the check workflow.
 * @param {number} now The current time, in milliseconds.
 * @returns {Run[]} The runs to cancel.
 */
export function stuckRuns(runs, now) {
  return runs.filter((run) => now - Date.parse(run.created_at) > STUCK_MINUTES * 60_000);
}

/**
 * Decides whether to tell developers the checks have stopped or started again. It keeps no
 * state: it sends when the time since the last success falls in a one-tick window, so one
 * tick sends and the next doesn't.
 *
 * @param {string[]} finished When the newest successful runs finished, newest first.
 * @param {number} now The current time, in milliseconds.
 * @returns {'stalled' | 'resumed' | null} The message to send, if any.
 */
export function stallAlert(finished, now) {
  const [last, previous] = finished.map((at) => Date.parse(at));
  if (last === undefined) return null;
  const sinceLast = (now - last) / 60_000;
  if (sinceLast >= STALE_MINUTES) {
    return (sinceLast - STALE_MINUTES) % REMIND_MINUTES < TICK_MINUTES ? 'stalled' : null;
  }
  if (previous !== undefined && sinceLast < TICK_MINUTES && (last - previous) / 60_000 >= STALE_MINUTES) {
    return 'resumed';
  }
  return null;
}

/**
 * Writes the Telegram text for a stalled or resumed monitor.
 *
 * @param {'stalled' | 'resumed'} kind What happened.
 * @param {string} lastSuccess When the last successful check before now finished.
 * @param {number} now The current time, in milliseconds.
 * @returns {string} The message.
 */
export function formatStallMessage(kind, lastSuccess, now) {
  const minutes = Math.round((now - Date.parse(lastSuccess)) / 60_000);
  const age = minutes >= 120 ? `${Math.round(minutes / 60)} hours` : `${minutes} minutes`;
  if (kind === 'stalled') {
    return [
      '⚠️ Status checks have STOPPED',
      `No successful check for ${age}.`,
      'See Actions → Check in Pekoe-Trail/pekoe-status-monitor.',
      SITE_URL,
    ].join('\n');
  }
  return ['✅ Status checks have RESUMED', SITE_URL].join('\n');
}

/**
 * Decides whether this tick reports the Worker's own errors: the first tick of every
 * six-hour block, so a lasting failure is reported four times a day and a one-off rarely.
 *
 * @param {number} now The current time, in milliseconds.
 * @returns {boolean} Whether to report.
 */
export function reportsErrorsNow(now) {
  return (now / 60_000) % REMIND_MINUTES < TICK_MINUTES;
}

/**
 * Writes the Telegram text for the Worker's own errors. They hold only step names and
 * HTTP status codes, never a token or a response body.
 *
 * @param {string[]} errors What failed.
 * @returns {string} The message.
 */
export function formatErrorMessage(errors) {
  return [
    '⚠️ The status check trigger is FAILING',
    ...errors,
    'A 401 usually means the GitHub token has expired.',
  ].join('\n');
}

/**
 * Calls the GitHub API for this repository.
 *
 * @param {Env} env The Worker's bindings.
 * @param {string} path The path after the repository.
 * @param {RequestInit} [init] Method and body.
 * @returns {Promise<Response>} The response.
 */
function github(env, path, init = {}) {
  return fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'pekoe-status-trigger',
      'Content-Type': 'application/json',
    },
  });
}

/**
 * Reads the check workflow's runs with one status.
 *
 * @param {Env} env The Worker's bindings.
 * @param {string} status The run status to list.
 * @param {number} perPage How many runs, newest first.
 * @returns {Promise<Run[]>} The runs.
 */
async function listRuns(env, status, perPage) {
  const res = await github(env, `/actions/workflows/${WORKFLOW}/runs?status=${status}&per_page=${perPage}`);
  if (!res.ok) throw new Error(`Listing ${status} runs: GitHub answered ${res.status}`);
  /** @type {{ workflow_runs: Run[] }} */
  const body = await res.json();
  return body.workflow_runs;
}

/**
 * Force-cancels every run of the check workflow that has been open too long.
 *
 * @param {Env} env The Worker's bindings.
 * @param {number} now The current time, in milliseconds.
 */
async function cancelStuckRuns(env, now) {
  const open = (await Promise.all(OPEN_STATUSES.map((status) => listRuns(env, status, 100)))).flat();
  for (const run of stuckRuns(open, now)) {
    const res = await github(env, `/actions/runs/${run.id}/force-cancel`, { method: 'POST' });
    if (!res.ok && res.status !== 409) throw new Error(`Cancelling run ${run.id}: GitHub answered ${res.status}`);
    console.log(`Cancelled run ${run.id}, open since ${run.created_at}`);
  }
}

/**
 * Tells developers on Telegram when the checks stop or start again.
 *
 * @param {Env} env The Worker's bindings.
 * @param {number} now The current time, in milliseconds.
 */
async function reportStall(env, now) {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) return;
  const finished = (await listRuns(env, 'success', 2)).map((run) => run.updated_at);
  const kind = stallAlert(finished, now);
  if (!kind) return;
  const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: env.TELEGRAM_CHAT_ID,
      text: formatStallMessage(kind, kind === 'stalled' ? finished[0] : finished[1], now),
      disable_web_page_preview: true,
    }),
  });
  if (!res.ok) throw new Error(`Telegram answered ${res.status}`);
}

export default {
  /**
   * Clears stuck runs, starts the status check, and reports a stalled monitor.
   *
   * @param {unknown} _event The cron event.
   * @param {Env} env The Worker's bindings.
   */
  async scheduled(_event, env) {
    const now = Date.now();
    /** @type {string[]} */
    const errors = [];
    const attempt = async (/** @type {() => Promise<void>} */ step) => {
      try {
        await step();
      } catch (err) {
        errors.push(err instanceof Error ? err.message : String(err));
      }
    };

    await attempt(() => cancelStuckRuns(env, now));
    await attempt(async () => {
      const res = await github(env, `/actions/workflows/${WORKFLOW}/dispatches`, {
        method: 'POST',
        body: JSON.stringify({ ref: 'main' }),
      });
      if (!res.ok) throw new Error(`Dispatch: GitHub answered ${res.status}`);
    });
    await attempt(() => reportStall(env, now));

    if (errors.length && reportsErrorsNow(now) && env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID) {
      await attempt(async () => {
        const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text: formatErrorMessage(errors) }),
        });
        if (!res.ok) throw new Error(`Telegram answered ${res.status}`);
      });
    }

    if (errors.length) throw new Error(errors.join('; '));
  },
};
