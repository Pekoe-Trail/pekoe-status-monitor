import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SystemConfig } from '../scripts/lib/config.ts';
import { createNotifier, formatMessage } from '../scripts/lib/notify.ts';
import type { Transition } from '../scripts/lib/state.ts';
import type { SystemState } from '../scripts/lib/types.ts';

const system = {
  id: 'api-login',
  name: 'Sign-in',
  description: 'Signing in to the app and portals',
  group: 'Platform',
  critical: true,
  sms: true,
  degradedMs: 3000,
  check: { type: 'login', baseUrl: 'https://api.example.com/v1' },
} as SystemConfig;

const state: SystemState = {
  status: 'down',
  checkedAt: '2026-09-22T08:47:00Z',
  ms: 400,
  code: 401,
  err: 'login',
  failStreak: 2,
  downSince: '2026-09-22T08:37:00Z',
  alerted: true,
};

describe('notification text', () => {
  it('starts with an icon for Telegram', () => {
    expect(formatMessage(system, state, { kind: 'down' })).toMatch(/^🔴 Sign-in is DOWN\n/);
  });

  it('has no emoji for SMS, so the DOWN text fits in one 160-character SMS', () => {
    const sms = formatMessage(system, state, { kind: 'down' }, { icons: false });
    expect(sms).toMatch(/^Sign-in is DOWN\n/);
    expect(sms).toMatch(/^[\x20-\x7E\n]+$/);
    expect(sms.length).toBeLessThanOrEqual(160);
  });
});

describe('channels with and without their secrets', () => {
  afterEach(() => vi.unstubAllGlobals());

  const telegram = { TELEGRAM_BOT_TOKEN: 't0ken', TELEGRAM_CHAT_ID: '-100' };
  const sms = {
    NOTIFYLK_USER_ID: '1',
    NOTIFYLK_API_KEY: 'key',
    NOTIFYLK_SENDER_ID: 'NotifyDEMO',
    NOTIFYLK_TO: '94770000000',
  };

  /**
   * Sends one transition with the given secrets, recording where it went.
   *
   * @param env The secrets that are set.
   * @param transition What changed; Down by default.
   * @returns The hosts that were called.
   */
  async function send(env: NodeJS.ProcessEnv, transition: NonNullable<Transition> = { kind: 'down' }) {
    const calls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        calls.push(new URL(url).host);
        return new Response('{}');
      }),
    );
    await createNotifier(env).send(system, state, transition);
    return calls;
  }

  it('sends nothing at all when no channel has its secrets', async () => {
    expect(await send({})).toEqual([]);
  });

  it('sends only Telegram when the SMS secrets are missing', async () => {
    expect(await send(telegram)).toEqual(['api.telegram.org']);
  });

  it('sends only SMS when the Telegram secrets are missing', async () => {
    expect(await send(sms)).toEqual(['app.notify.lk']);
  });

  it('sends to both when both are set', async () => {
    expect((await send({ ...telegram, ...sms })).sort()).toEqual(['api.telegram.org', 'app.notify.lk']);
  });

  it('keeps SMS for Down only, so a recovery costs nothing', async () => {
    const recovered: NonNullable<Transition> = { kind: 'recovered', downtimeMs: 600_000 };
    expect(await send({ ...telegram, ...sms }, recovered)).toEqual(['api.telegram.org']);
  });

  it('carries on when a channel fails, without throwing', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 500 })));
    await expect(createNotifier({ ...telegram, ...sms }).send(system, state, { kind: 'down' })).resolves.toBeUndefined();
  });
});
