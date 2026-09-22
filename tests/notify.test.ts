import { describe, expect, it } from 'vitest';
import type { SystemConfig } from '../scripts/lib/config.ts';
import { formatMessage } from '../scripts/lib/notify.ts';
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
