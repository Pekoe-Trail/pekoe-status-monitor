import { setTimeout as sleep } from 'node:timers/promises';
import { fetchAlerts } from './lib/alerts.ts';
import { loadConfig, type SystemConfig } from './lib/config.ts';
import { runCheck } from './lib/checks.ts';
import { inMaintenance, readMaintenance } from './lib/incidents.ts';
import { createNotifier } from './lib/notify.ts';
import { addToDaily, nextState } from './lib/state.ts';
import { Store } from './lib/store.ts';
import { addDays, localDay } from './lib/time.ts';
import type { CheckResult } from './lib/types.ts';

const config = loadConfig();
const store = new Store(process.env.STATUS_DATA_DIR ?? 'data');
const maintenance = readMaintenance('incidents');
const notifier = createNotifier();
const only = process.env.STATUS_ONLY?.split(',').map((id) => id.trim());

const systems = config.systems.filter((s) => !only || only.includes(s.id));
const { timeoutMs, retryDelayMs, confirmAfter, keepCheckDays } = config.settings;

/**
 * Runs a system's check, retrying once after `retryDelayMs` when it fails, so a single
 * dropped request doesn't count as Down.
 *
 * @param system The system to check.
 * @returns The passing result, or the retry's result after a failure; null when the check
 *   was skipped for missing secrets.
 */
async function checkWithRetry(system: SystemConfig): Promise<CheckResult | null> {
  const first = await runCheck(system, { timeoutMs });
  if (first?.s !== 'down') return first;
  await sleep(retryDelayMs);
  return runCheck(system, { timeoutMs });
}

const results = await Promise.all(
  systems.map(async (system) => [system, await checkWithRetry(system)] as const),
);

const current = store.readCurrent();

for (const [system, result] of results) {
  if (!result) {
    console.log(`${system.id.padEnd(22)} skipped (secrets not set)`);
    continue;
  }
  console.log(
    `${system.id.padEnd(22)} ${result.s.padEnd(8)} ${String(result.ms).padStart(6)} ms` +
      (result.code ? `  HTTP ${result.code}` : '') +
      (result.err ? `  ${result.err}` : ''),
  );

  const day = localDay(new Date(result.t));
  store.appendCheck(system.id, day, result);
  store.writeDaily(system.id, addToDaily(store.readDaily(system.id), day, result));
  store.pruneChecks(system.id, addDays(day, -(keepCheckDays - 1)));

  let { state, transition } = nextState(current.systems[system.id], result, confirmAfter);

  if (transition?.kind === 'down' && inMaintenance(maintenance, system.id, new Date(result.t))) {
    console.log(`${system.id.padEnd(22)} down during planned maintenance, not notifying`);
    state.alerted = false;
    transition = null;
  }

  if (transition) {
    console.log(`${system.id.padEnd(22)} notifying: ${transition.kind}`);
    await notifier.send(system, state, transition);
  }
  current.systems[system.id] = state;
}

for (const id of Object.keys(current.systems)) {
  if (!config.systems.some((s) => s.id === id)) delete current.systems[id];
}
current.updatedAt = new Date().toISOString();
store.writeCurrent(current);

if (config.alerts && (!only || only.includes('alerts'))) {
  try {
    const alerts = await fetchAlerts(config.alerts.historyUrl, {
      timeoutMs,
      maxPages: config.alerts.maxPages,
    });
    store.writeAlerts({ updatedAt: new Date().toISOString(), alerts });
    console.log(`${'alerts'.padEnd(22)} ${alerts.length} saved`);
  } catch (error) {
    const status = error instanceof Error && /^HTTP \d{3}$/.test(error.message) ? error.message : 'failed';
    console.log(`${'alerts'.padEnd(22)} not updated: ${status}`);
  }
}
