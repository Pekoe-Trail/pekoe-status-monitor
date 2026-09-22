import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { inMaintenance, readMaintenance } from '../scripts/lib/incidents.ts';

describe('maintenance windows', () => {
  const dir = mkdtempSync(join(tmpdir(), 'incidents-'));
  writeFileSync(
    join(dir, '2026-10-01-database-upgrade.md'),
    [
      '---',
      'title: Database upgrade',
      'type: maintenance',
      'systems: [api, api-login]',
      'status: scheduled',
      'started: 2026-10-01T22:00:00+05:30',
      'ended: 2026-10-01T23:30:00+05:30',
      '---',
      'Body',
    ].join('\n'),
  );
  writeFileSync(join(dir, '2026-09-01-outage.md'), '---\ntitle: x\nsystems: [api]\nstatus: resolved\nstarted: 2026-09-01\n---\n');
  writeFileSync(join(dir, '2026-09-02-broken.md'), '---\n: : not yaml [\n---\n');
  writeFileSync(join(dir, 'README.md'), '---\ntype: maintenance\n---\n');

  const windows = readMaintenance(dir);

  it('reads only maintenance notes and skips broken files', () => {
    expect(windows).toHaveLength(1);
  });

  it('silences only the listed systems, only inside the window', () => {
    expect(inMaintenance(windows, 'api', new Date('2026-10-01T17:00:00Z'))).toBe(true);
    expect(inMaintenance(windows, 'website', new Date('2026-10-01T17:00:00Z'))).toBe(false);
    expect(inMaintenance(windows, 'api', new Date('2026-10-01T18:01:00Z'))).toBe(false);
    expect(inMaintenance(windows, 'api', new Date('2026-10-01T16:29:00Z'))).toBe(false);
  });

  it('returns nothing when the folder is missing', () => {
    expect(readMaintenance(join(dir, 'missing'))).toEqual([]);
  });
});

describe('incident notes in this repo', () => {
  const files = readdirSync('incidents').filter((f) => /^\d.*\.md$/.test(f));

  it.each(files.length ? files : ['(none)'])('%s has no raw HTML', (file) => {
    if (file === '(none)') return;
    const body = readFileSync(join('incidents', file), 'utf8').replace(/^---[\s\S]*?---/, '');
    const withoutCode = body.replace(/```[\s\S]*?```/g, '').replace(/`[^`]*`/g, '');
    expect(withoutCode).not.toMatch(/<\/?[a-z!][^>]*>/i);
  });

  it.each(files.length ? files : ['(none)'])('%s is named YYYY-MM-DD-slug.md', (file) => {
    if (file === '(none)') return;
    expect(file).toMatch(/^\d{4}-\d{2}-\d{2}-[a-z0-9-]+\.md$/);
  });
});
