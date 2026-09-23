import type { SystemConfig } from './config.ts';
import type { FailureReason, SystemState } from './types.ts';
import { formatDuration, type Transition } from './state.ts';
import { TIME_ZONE } from './time.ts';

export const SITE_URL = 'https://status.thepekoetrail.org';

const REASONS: Record<FailureReason, string> = {
  timeout: 'no response in time',
  network: 'could not connect',
  status: 'unexpected HTTP status',
  content: 'page did not contain the expected text',
  login: 'sign-in failed',
};

const timeFormat = new Intl.DateTimeFormat('en-GB', {
  timeZone: TIME_ZONE,
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

/**
 * Describes why a system is Down, in words developers read in a notification.
 *
 * @param state The system's latest state.
 * @returns The reason, followed by the HTTP status when there was one.
 */
export function describeFailure(state: SystemState): string {
  const reason = state.err ? REASONS[state.err] : 'unknown';
  return state.code ? `${reason} (HTTP ${state.code})` : reason;
}

/**
 * Writes the notification text for a Down or Recovered transition. `icons: false` leaves
 * out the emoji, for SMS: an emoji switches the SMS to Unicode, where one message holds 70
 * characters instead of 160, so the DOWN text would be billed as 3 messages instead of 1.
 *
 * @param system The system that changed state.
 * @param state Its new state; Down uses `downSince` and the failure reason.
 * @param transition What changed; Recovered uses `downtimeMs`.
 * @param options.icons Whether to start with 🔴 or ✅.
 * @returns The message: title, details and a link to the system's page, one per line.
 */
export function formatMessage(
  system: SystemConfig,
  state: SystemState,
  transition: NonNullable<Transition>,
  { icons = true }: { icons?: boolean } = {},
): string {
  const link = `${SITE_URL}/systems/${system.id}`;
  if (transition.kind === 'down') {
    const since = timeFormat.format(new Date(state.downSince ?? state.checkedAt));
    return [
      `${icons ? '🔴 ' : ''}${system.name} is DOWN`,
      `Reason: ${describeFailure(state)}`,
      `Since: ${since} (Sri Lanka time)`,
      link,
    ].join('\n');
  }
  return [
    `${icons ? '✅ ' : ''}${system.name} has RECOVERED`,
    `Down for about ${formatDuration(transition.downtimeMs)}`,
    link,
  ].join('\n');
}

export interface Notifier {
  send(system: SystemConfig, state: SystemState, transition: NonNullable<Transition>): Promise<void>;
}

/**
 * Creates the notifier that sends to every channel with its secrets set: Telegram for every
 * change, and SMS without emoji for Down on systems with `sms: true`. A failing channel is
 * logged by name and status only (never the URL or response, which could carry a secret)
 * and does not stop the others.
 *
 * @param env Where to read the channels' secrets.
 * @returns The notifier.
 */
export function createNotifier(env: NodeJS.ProcessEnv = process.env): Notifier {
  return {
    /**
     * Sends one transition to every configured channel and waits for all of them.
     *
     * @param system The system that changed state.
     * @param state Its new state.
     * @param transition What changed.
     */
    async send(system, state, transition) {
      const text = formatMessage(system, state, transition);
      const jobs: [string, Promise<void>][] = [];

      if (env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID) {
        jobs.push(['telegram', telegram(env.TELEGRAM_BOT_TOKEN, env.TELEGRAM_CHAT_ID, text)]);
      }
      if (
        system.sms &&
        transition.kind === 'down' &&
        env.NOTIFYLK_USER_ID &&
        env.NOTIFYLK_API_KEY &&
        env.NOTIFYLK_SENDER_ID
      ) {
        jobs.push(['sms', notifyLk(env, formatMessage(system, state, transition, { icons: false }))]);
      }

      const results = await Promise.allSettled(jobs.map(([, job]) => job));
      results.forEach((result, i) => {
        if (result.status === 'rejected') {
          const detail = result.reason instanceof HttpError ? ` (HTTP ${result.reason.status})` : '';
          console.warn(`notify: ${jobs[i][0]} failed for ${system.id}${detail}`);
        }
      });
    },
  };
}

/** Raised when a notification API answers with a non-2xx status. */
class HttpError extends Error {
  /**
   * Creates the error; its message is only `HTTP <status>`, never the response.
   *
   * @param status The HTTP status the API answered with.
   */
  constructor(readonly status: number) {
    super(`HTTP ${status}`);
  }
}

/**
 * POSTs to a notification API with a 15-second timeout.
 *
 * @param url The API endpoint; may carry a secret, so it's never logged.
 * @param init The request body and headers.
 * @returns The response, when its status is 2xx; otherwise throws HttpError.
 */
async function post(url: string, init: RequestInit): Promise<Response> {
  const res = await fetch(url, { method: 'POST', signal: AbortSignal.timeout(15_000), ...init });
  if (!res.ok) throw new HttpError(res.status);
  return res;
}

/**
 * Sends a message to the Telegram chat, without a link preview.
 *
 * @param token The bot token.
 * @param chatId The developers' chat.
 * @param text The message.
 */
async function telegram(token: string, chatId: string, text: string): Promise<void> {
  await post(`https://api.telegram.org/bot${token}/sendMessage`, {
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, link_preview_options: { is_disabled: true } }),
  });
}

/**
 * Sends an SMS through notify.lk to each number in `NOTIFYLK_TO`, one at a time.
 *
 * @param env Where to read the notify.lk secrets; `NOTIFYLK_TO` is a comma-separated list
 *   of numbers like 9477XXXXXXX.
 * @param text The message.
 */
async function notifyLk(env: NodeJS.ProcessEnv, text: string): Promise<void> {
  const to = (env.NOTIFYLK_TO ?? '').split(',').map((n) => n.trim()).filter(Boolean);
  for (const number of to) {
    await post('https://app.notify.lk/api/v1/send', {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        user_id: env.NOTIFYLK_USER_ID ?? '',
        api_key: env.NOTIFYLK_API_KEY ?? '',
        sender_id: env.NOTIFYLK_SENDER_ID ?? '',
        to: number,
        message: text,
      }),
    });
  }
}
