import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';

export interface MaintenanceWindow {
  systems: string[];
  start: Date;
  end: Date;
}

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---/;

/**
 * Reads the planned maintenance windows from the incident notes. A malformed file is
 * skipped rather than thrown on, so it can never stop the checks; the site build
 * validates these files fully.
 *
 * @param dir The incident notes folder.
 * @returns Every maintenance window with a valid start and end; empty when the folder
 *   doesn't exist.
 */
export function readMaintenance(dir: string): MaintenanceWindow[] {
  if (!existsSync(dir)) return [];
  const windows: MaintenanceWindow[] = [];
  for (const file of readdirSync(dir)) {
    if (!/^\d.*\.md$/.test(file)) continue;
    const match = FRONTMATTER.exec(readFileSync(join(dir, file), 'utf8'));
    if (!match) continue;
    try {
      const data = parse(match[1]) as Record<string, unknown>;
      if (data.type !== 'maintenance' || !Array.isArray(data.systems)) continue;
      const start = new Date(String(data.started));
      const end = new Date(String(data.ended));
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) continue;
      windows.push({ systems: data.systems.map(String), start, end });
    } catch {
      continue;
    }
  }
  return windows;
}

/**
 * Tells whether a system is inside a planned maintenance window at a given time.
 *
 * @param windows The maintenance windows from `readMaintenance`.
 * @param system The system id.
 * @param at The time to test, usually the check's time.
 * @returns True when a window lists the system and covers `at`, ends included.
 */
export function inMaintenance(windows: MaintenanceWindow[], system: string, at: Date): boolean {
  return windows.some((w) => w.systems.includes(system) && w.start <= at && at <= w.end);
}
