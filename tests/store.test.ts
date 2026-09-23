import { mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Alert } from '../scripts/lib/alerts.ts';
import { Store } from '../scripts/lib/store.ts';

/**
 * Builds an alert published at a given time.
 *
 * @param id The alert id.
 * @param publishedAt When it was published.
 * @returns The alert, with only the fields the store cares about filled in.
 */
const alert = (id: string, publishedAt: string) =>
  ({
    id,
    number: id.toUpperCase(),
    scope: 'GLOBAL',
    status: 'CLOSED',
    severity: { value: 'ADVISORY', label: 'Advisory' },
    category: { label: 'Weather' },
    stages: [],
    publishedAt,
    updatedAt: publishedAt,
    history: [],
  }) as unknown as Alert;

describe('Store alerts', () => {
  const store = () => new Store(mkdtempSync(join(tmpdir(), 'store-')));

  it('keeps one file per year, and reads every year back newest first', () => {
    const s = store();
    s.writeAlerts({
      updatedAt: '2026-09-23T06:00:00.000Z',
      alerts: [alert('c', '2026-05-01T06:00:00.000Z'), alert('b', '2025-06-01T06:00:00.000Z'), alert('a', '2024-02-01T06:00:00.000Z')],
    });

    expect(readdirSync(join(s.root, 'alerts')).sort()).toEqual(['2024.json', '2025.json', '2026.json', 'meta.json']);
    const saved = s.readAlerts()!;
    expect(saved.alerts.map((x) => x.id)).toEqual(['c', 'b', 'a']);
    expect(saved.updatedAt).toBe('2026-09-23T06:00:00.000Z');
  });

  it('uses the Sri Lanka year, so a late-December evening in UTC is the next year', () => {
    const s = store();
    s.writeAlerts({ updatedAt: 'now', alerts: [alert('a', '2025-12-31T23:00:00.000Z')] });
    expect(readdirSync(join(s.root, 'alerts'))).toContain('2026.json');
  });

  it('rewrites only the years that changed', () => {
    const s = store();
    const old = alert('a', '2024-02-01T06:00:00.000Z');
    s.writeAlerts({ updatedAt: 'first', alerts: [old, alert('b', '2026-02-01T06:00:00.000Z')] });
    const before = statSync(join(s.root, 'alerts', '2024.json')).mtimeMs;

    s.writeAlerts({ updatedAt: 'second', alerts: [old, alert('b', '2026-02-01T06:00:00.000Z'), alert('c', '2026-03-01T06:00:00.000Z')] });

    expect(statSync(join(s.root, 'alerts', '2024.json')).mtimeMs).toBe(before);
    expect(JSON.parse(readFileSync(join(s.root, 'alerts', '2026.json'), 'utf8'))).toHaveLength(2);
  });

  it('keeps a year that a later save no longer mentions', () => {
    const s = store();
    s.writeAlerts({ updatedAt: 'first', alerts: [alert('a', '2024-02-01T06:00:00.000Z')] });
    s.writeAlerts({ updatedAt: 'second', alerts: [alert('b', '2026-02-01T06:00:00.000Z')] });
    expect(s.readAlerts()!.alerts.map((x) => x.id)).toEqual(['b', 'a']);
  });

  it('reads the single alerts.json of the first version of the folder', () => {
    const s = store();
    mkdirSync(s.root, { recursive: true });
    writeFileSync(
      join(s.root, 'alerts.json'),
      JSON.stringify({ updatedAt: 'old', alerts: [alert('a', '2026-02-01T06:00:00.000Z')] }),
    );
    expect(s.readAlerts()!.alerts.map((x) => x.id)).toEqual(['a']);
  });
});
