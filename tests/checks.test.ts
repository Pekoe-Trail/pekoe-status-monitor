import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runCheck, USER_AGENT } from '../scripts/lib/checks.ts';
import type { SystemConfig } from '../scripts/lib/config.ts';

type Handler = (req: IncomingMessage, res: ServerResponse, body: string) => void;
const routes = new Map<string, Handler>();
const requests: { method?: string; url?: string; headers: IncomingMessage['headers'] }[] = [];
let server: Server;
let base: string;

beforeAll(async () => {
  server = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      requests.push({ method: req.method, url: req.url, headers: req.headers });
      const handler = routes.get(`${req.method} ${req.url}`);
      if (handler) handler(req, res, body);
      else res.writeHead(404).end();
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => server.close());

/**
 * Builds an http system that checks a path on the local test server.
 *
 * @param path The path to GET.
 * @param extra Check fields to override, such as `expectText`.
 * @returns The system config.
 */
function http(path: string, extra: Partial<Extract<SystemConfig['check'], { type: 'http' }>> = {}): SystemConfig {
  return {
    id: 'test',
    name: 'Test',
    description: '',
    group: 'Test',
    critical: false,
    sms: false,
    degradedMs: 1000,
    check: { type: 'http', url: `${base}${path}`, expectStatus: 200, ...extra },
  };
}

const options = { timeoutMs: 500 };

describe('http check', () => {
  it('passes on the expected status and text, and identifies itself', async () => {
    routes.set('GET /ok', (_, res) => res.writeHead(200).end('Welcome to the Pekoe Trail'));
    const result = await runCheck(http('/ok', { expectText: 'Pekoe Trail' }), options);
    expect(result).toMatchObject({ s: 'up', code: 200 });
    expect(result).not.toHaveProperty('err');
    expect(requests.at(-1)?.headers['user-agent']).toBe(USER_AGENT);
  });

  it('fails on an unexpected status', async () => {
    routes.set('GET /broken', (_, res) => res.writeHead(502).end('Bad gateway: upstream 10.0.0.4'));
    const result = await runCheck(http('/broken'), options);
    expect(result).toMatchObject({ s: 'down', code: 502, err: 'status' });
  });

  it('accepts a non-200 status when that is what is expected', async () => {
    routes.set('GET /forbidden', (_, res) => res.writeHead(403).end());
    expect(await runCheck(http('/forbidden', { expectStatus: 403 }), options)).toMatchObject({ s: 'up' });
  });

  it('fails when the expected text is missing', async () => {
    routes.set('GET /empty', (_, res) => res.writeHead(200).end('maintenance page'));
    const result = await runCheck(http('/empty', { expectText: 'Pekoe Trail' }), options);
    expect(result).toMatchObject({ s: 'down', code: 200, err: 'content' });
  });

  it('fails with timeout when the server does not answer in time', async () => {
    routes.set('GET /slow', (_, res) => setTimeout(() => res.writeHead(200).end(), 2000));
    expect(await runCheck(http('/slow'), options)).toMatchObject({ s: 'down', err: 'timeout' });
  });

  it('fails with network when nothing is listening', async () => {
    const system = http('/');
    system.check = { type: 'http', url: 'http://127.0.0.1:1/', expectStatus: 200 };
    expect(await runCheck(system, options)).toMatchObject({ s: 'down', err: 'network' });
  });

  it('marks a slow passing check as degraded', async () => {
    routes.set('GET /sluggish', (_, res) => setTimeout(() => res.writeHead(200).end(), 150));
    const system = { ...http('/sluggish'), degradedMs: 50 };
    expect(await runCheck(system, options)).toMatchObject({ s: 'degraded', code: 200 });
  });

  it('never stores anything from the response', async () => {
    routes.set('GET /leaky', (_, res) => res.writeHead(500, { 'X-Secret': 'abc' }).end('stack trace at /srv/app.js'));
    const result = await runCheck(http('/leaky'), options);
    expect(Object.keys(result!).sort()).toEqual(['code', 'err', 'ms', 's', 't']);
  });
});

describe('login check', () => {
  const env = { MONITOR_EMAIL: 'monitor@example.com', MONITOR_PASSWORD: 'secret' };
  /**
   * Builds a login system that signs in against the local test server.
   *
   * @returns The system config.
   */
  const login = (): SystemConfig => ({
    ...http('/'),
    check: { type: 'login', baseUrl: `${base}/v1` },
  });

  it('is skipped without its secrets', async () => {
    expect(await runCheck(login(), { ...options, env: {} })).toBeNull();
  });

  it('signs in, fetches the profile and logs out', async () => {
    routes.set('POST /v1/login', (req, res, body) => {
      const ok = req.headers.platform === 'MOBILE' && JSON.parse(body).password === 'secret';
      res.writeHead(ok ? 201 : 401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(ok ? { data: { keycloakTokens: { access_token: 'tok' } } } : {}));
    });
    routes.set('GET /v1/users/me', (req, res) =>
      res.writeHead(req.headers.authorization === 'Bearer tok' ? 200 : 401).end('{}'),
    );
    routes.set('POST /v1/logout', (_, res) => res.writeHead(201).end());

    requests.length = 0;
    const result = await runCheck(login(), { ...options, env });
    expect(result).toMatchObject({ s: 'up', code: 201 });
    expect(requests.map((r) => `${r.method} ${r.url}`)).toEqual([
      'POST /v1/login',
      'GET /v1/users/me',
      'POST /v1/logout',
    ]);
  });

  it('fails with login when the credentials are rejected', async () => {
    const result = await runCheck(login(), { ...options, env: { ...env, MONITOR_PASSWORD: 'wrong' } });
    expect(result).toMatchObject({ s: 'down', code: 401, err: 'login' });
  });

  it('fails when the profile call fails, and still logs out', async () => {
    routes.set('GET /v1/users/me', (_, res) => res.writeHead(500).end());
    requests.length = 0;
    const result = await runCheck(login(), { ...options, env });
    expect(result).toMatchObject({ s: 'down', code: 500, err: 'status' });
    expect(requests.at(-1)?.url).toBe('/v1/logout');
  });

  it('does not follow a redirect with the password', async () => {
    routes.set('POST /v1/login', (_, res) =>
      res.writeHead(307, { Location: `${base}/elsewhere` }).end(),
    );
    requests.length = 0;
    const result = await runCheck(login(), { ...options, env });
    expect(result).toMatchObject({ s: 'down', err: 'network' });
    expect(requests.map((r) => r.url)).toEqual(['/v1/login']);
  });
});
