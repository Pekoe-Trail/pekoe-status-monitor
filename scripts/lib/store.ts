import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import type { AlertsFile } from './alerts.ts';
import type { CheckResult, CurrentFile, DailyFile } from './types.ts';

/**
 * Reads and writes the status data files: `current.json`, `alerts.json`, the detailed
 * checks under `checks/` and the daily totals under `daily/`.
 */
export class Store {
  /**
   * Creates a store for a status data folder.
   *
   * @param root The folder holding the status data, usually the `status-data` checkout.
   */
  constructor(readonly root: string) {}

  /**
   * Reads each system's latest state.
   *
   * @returns The saved states, or an empty file when none exists yet.
   */
  readCurrent(): CurrentFile {
    return this.readJson<CurrentFile>('current.json') ?? { updatedAt: '', systems: {} };
  }

  /**
   * Saves each system's latest state.
   *
   * @param current The states to write to `current.json`.
   */
  writeCurrent(current: CurrentFile): void {
    this.writeJson('current.json', current);
  }

  /**
   * Reads the saved trail alerts.
   *
   * @returns The last saved alerts, or undefined when none were ever saved.
   */
  readAlerts(): AlertsFile | undefined {
    return this.readJson<AlertsFile>('alerts.json');
  }

  /**
   * Saves the trail alerts, replacing the previous copy.
   *
   * @param alerts The alerts to write to `alerts.json`.
   */
  writeAlerts(alerts: AlertsFile): void {
    this.writeJson('alerts.json', alerts);
  }

  /**
   * Reads one system's detailed checks for one day.
   *
   * @param system The system id.
   * @param day The Sri Lanka date, as `YYYY-MM-DD`.
   * @returns The day's checks in the order they ran; empty when there are none.
   */
  readChecks(system: string, day: string): CheckResult[] {
    return this.readJson<CheckResult[]>(join('checks', system, `${day}.json`)) ?? [];
  }

  /**
   * Adds a check to the end of a system's file for that day.
   *
   * @param system The system id.
   * @param day The Sri Lanka date, as `YYYY-MM-DD`.
   * @param result The check to add.
   */
  appendCheck(system: string, day: string, result: CheckResult): void {
    this.writeJson(join('checks', system, `${day}.json`), [...this.readChecks(system, day), result]);
  }

  /**
   * Reads a system's daily totals.
   *
   * @param system The system id.
   * @returns The totals keyed by Sri Lanka date; empty when there are none.
   */
  readDaily(system: string): DailyFile {
    return this.readJson<DailyFile>(join('daily', `${system}.json`)) ?? {};
  }

  /**
   * Saves a system's daily totals.
   *
   * @param system The system id.
   * @param daily The totals keyed by Sri Lanka date.
   */
  writeDaily(system: string, daily: DailyFile): void {
    this.writeJson(join('daily', `${system}.json`), daily);
  }

  /**
   * Deletes a system's detailed check files for the days before `firstKeptDay`.
   *
   * @param system The system id.
   * @param firstKeptDay The oldest day to keep, as `YYYY-MM-DD`.
   */
  pruneChecks(system: string, firstKeptDay: string): void {
    const dir = join(this.root, 'checks', system);
    if (!existsSync(dir)) return;
    for (const file of readdirSync(dir)) {
      if (file.endsWith('.json') && file.slice(0, -5) < firstKeptDay) rmSync(join(dir, file));
    }
  }

  /**
   * Reads and parses a JSON file in the store.
   *
   * @param path The file's path inside the store.
   * @returns The parsed content, or undefined when the file doesn't exist.
   */
  private readJson<T>(path: string): T | undefined {
    const full = join(this.root, path);
    if (!existsSync(full)) return undefined;
    return JSON.parse(readFileSync(full, 'utf8')) as T;
  }

  /**
   * Writes a JSON file in the store, creating its folder. An array is written one item
   * per line, which keeps the check files readable and their diffs small.
   *
   * @param path The file's path inside the store.
   * @param value The content to write.
   */
  private writeJson(path: string, value: unknown): void {
    const full = join(this.root, path);
    mkdirSync(dirname(full), { recursive: true });
    const text = Array.isArray(value)
      ? `[\n${value.map((v) => `  ${JSON.stringify(v)}`).join(',\n')}\n]\n`
      : `${JSON.stringify(value, null, 2)}\n`;
    writeFileSync(full, text);
  }
}
