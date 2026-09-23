import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import type { Alert, AlertsFile } from './alerts.ts';
import { localDay } from './time.ts';
import type { CheckResult, CurrentFile, DailyFile } from './types.ts';

/** `data/alerts/meta.json`: everything about the alerts except the alerts themselves */
interface AlertsMeta {
  updatedAt: string;
}

/** Where the alerts of one year are kept */
const yearFile = (year: string) => join('alerts', `${year}.json`);

/**
 * Gives the year an alert belongs to.
 *
 * @param alert The alert.
 * @returns The Sri Lanka calendar year it was published in, such as `2026`.
 */
const alertYear = (alert: Alert) => localDay(new Date(alert.publishedAt)).slice(0, 4);

/**
 * Reads and writes the status data files: `current.json`, the trail alerts under `alerts/`,
 * the detailed checks under `checks/` and the daily totals under `daily/`.
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
   * Reads the saved trail alerts, from every year kept under `alerts/`. Falls back to the
   * single `alerts.json` of the first version of this folder.
   *
   * @returns The alerts, newest first, with when they were last read; undefined when none
   *   were ever saved.
   */
  readAlerts(): AlertsFile | undefined {
    const meta = this.readJson<AlertsMeta>(join('alerts', 'meta.json'));
    if (!meta) return this.readJson<AlertsFile>('alerts.json');
    const alerts = this.alertYears().flatMap((year) => this.readJson<Alert[]>(yearFile(year)) ?? []);
    return { ...meta, alerts };
  }

  /**
   * Saves the trail alerts, one file per year so no file grows without end. A year's file is
   * rewritten only when that year's alerts changed, which keeps the daily commits small.
   *
   * @param file The alerts to save, with when they were read.
   */
  writeAlerts(file: AlertsFile): void {
    const years = new Map<string, Alert[]>();
    for (const alert of file.alerts) {
      const year = alertYear(alert);
      years.set(year, [...(years.get(year) ?? []), alert]);
    }
    for (const [year, alerts] of years) {
      const saved = this.readJson<Alert[]>(yearFile(year));
      if (JSON.stringify(saved) !== JSON.stringify(alerts)) this.writeJson(yearFile(year), alerts);
    }
    const { alerts, ...meta } = file;
    this.writeJson(join('alerts', 'meta.json'), meta);
  }

  /**
   * Lists the years that have an alerts file.
   *
   * @returns The years, newest first, as `YYYY`.
   */
  private alertYears(): string[] {
    const full = join(this.root, 'alerts');
    if (!existsSync(full)) return [];
    return readdirSync(full)
      .filter((name) => /^\d{4}\.json$/.test(name))
      .map((name) => name.slice(0, 4))
      .sort((a, b) => b.localeCompare(a));
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
