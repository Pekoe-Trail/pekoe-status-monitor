import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';
import { loadConfig } from '../scripts/lib/config.ts';

const systemIds = loadConfig().systems.map((s) => s.id);

export const INCIDENT_STATUSES = ['investigating', 'identified', 'monitoring', 'resolved'] as const;
export const MAINTENANCE_STATUSES = ['scheduled', 'in-progress', 'completed'] as const;

const incidents = defineCollection({
  loader: glob({ pattern: '[0-9]*.md', base: './incidents' }),
  schema: z
    .object({
      title: z.string().min(1).max(100),
      type: z.enum(['incident', 'maintenance']).default('incident'),
      severity: z.enum(['minor', 'major', 'critical']).default('minor'),
      systems: z.array(z.enum(systemIds)).min(1),
      status: z.enum([...INCIDENT_STATUSES, ...MAINTENANCE_STATUSES]),
      started: z.coerce.date(),
      ended: z.coerce.date().optional(),
    })
    .refine(
      (i) =>
        i.type === 'incident'
          ? (INCIDENT_STATUSES as readonly string[]).includes(i.status)
          : (MAINTENANCE_STATUSES as readonly string[]).includes(i.status),
      { message: 'status must match type: incidents use investigating/identified/monitoring/resolved, maintenance uses scheduled/in-progress/completed' },
    )
    .refine((i) => i.type !== 'maintenance' || i.ended, {
      message: 'maintenance needs `ended`, the planned end of the window',
    })
    .refine((i) => i.status !== 'resolved' || i.ended, {
      message: 'a resolved incident needs `ended`',
    })
    .refine((i) => !i.ended || i.ended >= i.started, { message: '`ended` is before `started`' }),
});

export const collections = { incidents };
