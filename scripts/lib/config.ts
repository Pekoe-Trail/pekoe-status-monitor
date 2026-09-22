import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import { z } from 'zod';

const httpCheck = z.object({
  type: z.literal('http'),
  url: z.url(),
  expectStatus: z.number().int().default(200),
  expectText: z.string().optional(),
});

const loginCheck = z.object({
  type: z.literal('login'),
  baseUrl: z.url(),
});

const system = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string(),
  description: z.string().default(''),
  group: z.string(),
  url: z.url().optional(),
  critical: z.boolean().default(false),
  sms: z.boolean().default(false),
  degradedMs: z.number().int().positive(),
  check: z.discriminatedUnion('type', [httpCheck, loginCheck]),
});

const config = z
  .object({
    settings: z.object({
      timeoutMs: z.number().int().positive(),
      retryDelayMs: z.number().int().nonnegative(),
      confirmAfter: z.number().int().min(1),
      keepCheckDays: z.number().int().min(1),
    }),
    systems: z.array(system).min(1),
    alerts: z
      .object({
        historyUrl: z.url(),
        maxPages: z.number().int().min(1).default(4),
        stages: z.number().int().min(0).default(0),
      })
      .optional(),
  })
  .refine((c) => new Set(c.systems.map((s) => s.id)).size === c.systems.length, {
    message: 'System ids must be unique',
  });

export type Config = z.infer<typeof config>;
export type SystemConfig = z.infer<typeof system>;
export type CheckConfig = SystemConfig['check'];

export const CONFIG_PATH = join(process.cwd(), 'config', 'systems.yml');

/**
 * Reads and validates the systems config.
 *
 * @param path The YAML file to read; defaults to `config/systems.yml` under the working
 *   directory, which is the repo root for both the scripts and the site build.
 * @returns The validated config, with defaults filled in.
 */
export function loadConfig(path: string = CONFIG_PATH): Config {
  return config.parse(parse(readFileSync(path, 'utf8')));
}
