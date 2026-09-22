import type { CheckConfig, SystemConfig } from './config.ts';
import type { CheckResult, FailureReason } from './types.ts';

export const USER_AGENT = 'PekoeStatusBot/1.0 (+https://status.thepekoetrail.org)';

export interface CheckOptions {
  timeoutMs: number;
  env?: NodeJS.ProcessEnv;
  now?: () => Date;
}

/** Raised inside a check to fail it with a reason and, when known, a status code. */
class CheckFailure extends Error {
  /**
   * Creates a failure.
   *
   * @param reason The coarse failure type stored with the check.
   * @param code The HTTP status, when a response arrived.
   */
  constructor(
    readonly reason: FailureReason,
    readonly code?: number,
  ) {
    super(reason);
  }
}

/**
 * Runs one system's check. Never throws, and never returns anything taken from a
 * response body, header or error message: this result is committed to a public repo.
 *
 * @param system The system to check.
 * @param options Timeout, and the environment and clock to use (overridable in tests).
 * @returns The result, Degraded when slower than `degradedMs`; null when the check can't
 *   run here because its secrets aren't set.
 */
export async function runCheck(
  system: SystemConfig,
  options: CheckOptions,
): Promise<CheckResult | null> {
  const now = options.now ?? (() => new Date());
  const started = performance.now();
  try {
    const { ms, code } = await dispatch(system.check, options);
    return {
      t: now().toISOString(),
      s: ms > system.degradedMs ? 'degraded' : 'up',
      ms,
      code,
    };
  } catch (error) {
    if (error instanceof MissingSecrets) return null;
    const failure = toFailure(error);
    return {
      t: now().toISOString(),
      s: 'down',
      ms: Math.round(performance.now() - started),
      ...(failure.code !== undefined && { code: failure.code }),
      err: failure.reason,
    };
  }
}

/** Raised when a check can't run here, for example the login check without its secrets. */
export class MissingSecrets extends Error {}

/**
 * Runs the check that matches the config's `type`.
 *
 * @param check The system's check config.
 * @param options Timeout and environment.
 * @returns The response time and HTTP status of a passing check.
 */
function dispatch(check: CheckConfig, options: CheckOptions) {
  switch (check.type) {
    case 'http':
      return httpCheck(check, options);
    case 'login':
      return loginCheck(check, options);
  }
}

/**
 * GETs the URL and passes on `expectStatus`, and on `expectText` when set. The body is only
 * read when `expectText` needs it, and never kept.
 *
 * @param check The http check config.
 * @param options.timeoutMs How long to wait for the response.
 * @returns The response time, including reading the body, and the HTTP status.
 */
async function httpCheck(
  check: Extract<CheckConfig, { type: 'http' }>,
  { timeoutMs }: CheckOptions,
) {
  const started = performance.now();
  const res = await request(check.url, { method: 'GET' }, timeoutMs);
  const body = check.expectText ? await res.text() : (await res.body?.cancel(), '');
  const ms = Math.round(performance.now() - started);
  if (res.status !== check.expectStatus) throw new CheckFailure('status', res.status);
  if (check.expectText && !body.includes(check.expectText)) {
    throw new CheckFailure('content', res.status);
  }
  return { ms, code: res.status };
}

/**
 * Signs in with the monitoring account, fetches its profile, then logs out so no session
 * is left behind. `Platform: MOBILE` returns the tokens in the body rather than setting a
 * cookie. Redirects are not followed, so the password and token are only ever sent to
 * `baseUrl`; a redirect fails the check. A failed logout doesn't fail the check or hide
 * its real result. Throws MissingSecrets when the account's secrets aren't set.
 *
 * @param check The login check config.
 * @param options.timeoutMs How long to wait for each request.
 * @param options.env Where to read `MONITOR_EMAIL` and `MONITOR_PASSWORD`.
 * @returns The sign-in request's response time and HTTP status.
 */
async function loginCheck(
  check: Extract<CheckConfig, { type: 'login' }>,
  { timeoutMs, env = process.env }: CheckOptions,
) {
  const email = env.MONITOR_EMAIL;
  const password = env.MONITOR_PASSWORD;
  if (!email || !password) throw new MissingSecrets();

  const base = check.baseUrl.replace(/\/$/, '');
  const json = { 'Content-Type': 'application/json', Platform: 'MOBILE' };
  const noRedirect = { redirect: 'error' } as const;

  const started = performance.now();
  const login = await request(
    `${base}/login`,
    { ...noRedirect, method: 'POST', headers: json, body: JSON.stringify({ email, password }) },
    timeoutMs,
  );
  const ms = Math.round(performance.now() - started);
  if (!login.ok) {
    await login.body?.cancel();
    throw new CheckFailure('login', login.status);
  }
  const token = await readAccessToken(login);
  if (!token) throw new CheckFailure('login', login.status);

  const auth = { ...json, Authorization: `Bearer ${token}` };
  try {
    const me = await request(`${base}/users/me`, { ...noRedirect, headers: auth }, timeoutMs);
    await me.body?.cancel();
    if (!me.ok) throw new CheckFailure('status', me.status);
  } finally {
    await request(`${base}/logout`, { ...noRedirect, method: 'POST', headers: auth }, timeoutMs)
      .then((res) => res.body?.cancel())
      .catch(() => undefined);
  }
  return { ms, code: login.status };
}

/**
 * Reads the access token from a sign-in response.
 *
 * @param res The sign-in response.
 * @returns The token, or undefined when the body isn't JSON or has no token.
 */
async function readAccessToken(res: Response): Promise<string | undefined> {
  try {
    const body = (await res.json()) as { data?: { keycloakTokens?: { access_token?: unknown } } };
    const token = body.data?.keycloakTokens?.access_token;
    return typeof token === 'string' && token ? token : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Sends a request with the monitor's User-Agent and a timeout. Redirects are followed
 * unless `init` sets `redirect`.
 *
 * @param url Where to send it.
 * @param init The fetch options.
 * @param timeoutMs How long to wait before aborting.
 * @returns The response.
 */
async function request(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  return fetch(url, {
    redirect: 'follow',
    ...init,
    headers: { 'User-Agent': USER_AGENT, ...init.headers },
    signal: AbortSignal.timeout(timeoutMs),
  });
}

/**
 * Turns anything a check threw into a failure with a coarse reason.
 *
 * @param error What was thrown.
 * @returns The failure itself, or `timeout` or `network`.
 */
function toFailure(error: unknown): CheckFailure {
  if (error instanceof CheckFailure) return error;
  if (error instanceof DOMException && error.name === 'TimeoutError') {
    return new CheckFailure('timeout');
  }
  return new CheckFailure('network');
}
