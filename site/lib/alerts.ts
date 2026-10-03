import { loadConfig } from '../../scripts/lib/config.ts';
import {
  SEVERITIES,
  currentAlerts,
  type Alert,
  type Channel,
  type Severity,
} from '../../scripts/lib/alerts.ts';
import { Store } from '../../scripts/lib/store.ts';
import { localDay } from '../../scripts/lib/time.ts';
import { incidentStories } from './lifecycle.ts';

export type { Alert, Channel, Severity };

const file = new Store(process.env.STATUS_DATA_DIR ?? 'data').readAlerts();
const stageCount = loadConfig().alerts?.stages ?? 0;

export const hasAlerts = !!file;
export const alertsUpdatedAt = file ? new Date(file.updatedAt) : null;
export const alerts: Alert[] = file?.alerts ?? [];
export const current: Alert[] = currentAlerts(alerts);
export const past: Alert[] = alerts.filter((alert) => !current.includes(alert));

/**
 * The years the archive holds alerts for, for a stage page's year links.
 *
 * @returns The Sri Lanka calendar years, newest first, such as `['2026', '2025']`.
 */
export const alertYears: string[] = [
  ...new Set(alerts.map((alert) => localDay(new Date(alert.publishedAt)).slice(0, 4))),
].sort((a, b) => b.localeCompare(a));

export const firstRecordDay: string | null = alerts.reduce<string | null>((first, alert) => {
  const day = localDay(new Date(alert.publishedAt));
  return first === null || day < first ? day : first;
}, null);

/**
 * Names the CSS class for a severity. The colours live in the stylesheet, because the
 * Content-Security-Policy forbids inline styles.
 *
 * @param severity The alert severity.
 * @returns A class such as `sev-closed`.
 */
export const severityClass = (severity: Severity) => `sev-${severity.toLowerCase()}`;

/**
 * Builds the link to an alert's page.
 *
 * @param alert The alert.
 * @returns Its path, such as `/alerts/tpto-psa-00000042`.
 */
export const alertHref = (alert: Alert) => `/alerts/${alert.number.toLowerCase()}`;

/**
 * Builds the link to a stage's page.
 *
 * @param stage The stage number.
 * @returns Its path, such as `/stages/4`.
 */
export const stageHref = (stage: number) => `/stages/${stage}`;

export const CHANNEL_LABEL: Record<Channel, string> = {
  WEBSITE: 'Posted on the website',
  HOMEPAGE: 'On the homepage banner',
  APP: 'Shown in the app',
  PUSH: 'Phone notification',
  EMAIL: 'Sent by email',
};

/**
 * Names an alert: its title, or its incident's description when it has none.
 *
 * @param alert The alert.
 * @returns The name to show.
 */
export const alertTitle = (alert: Alert) => alert.title ?? alert.incident.description;

/**
 * Describes which stages an alert covers.
 *
 * @param alert The alert.
 * @returns "All stages", "Stage 4" or "Stages 3, 4", with stages in number order.
 */
export const where = (alert: Alert): string =>
  stagesLabel(alert.stages.map((s) => s.number).sort((a, b) => a - b));

/**
 * Tells whether an alert applies to a stage.
 *
 * @param alert The alert.
 * @param stage The stage number.
 * @returns True when the alert covers the stage.
 */
export const covers = (alert: Alert, stage: number) => alert.stages.some((s) => s.number === stage);

export interface StageView {
  number: number;
  /** The worst severity the stage shows; OK when it shows nothing worse */
  severity: Severity;
}

/**
 * Picks the alerts a stage shows now: the newest alert there of each incident live on it.
 * An alert that covers the stage can still be showing only on another one, once a newer alert
 * of its incident cleared this stage.
 *
 * @param stage The stage number.
 * @returns The alerts, most severe first, then most recently published.
 */
export const showingOn = (stage: number): Alert[] =>
  incidentStories(alerts, stage)
    .filter((story) => story.state === 'live')
    .map((story) => story.latest)
    .sort(
      (a, b) =>
        SEVERITIES.indexOf(b.severity.value) - SEVERITIES.indexOf(a.severity.value) ||
        Date.parse(b.publishedAt) - Date.parse(a.publishedAt),
    );

export const stages: StageView[] = (() => {
  const highest = Math.max(stageCount, ...current.flatMap((a) => a.stages.map((s) => s.number)));
  return Array.from({ length: highest }, (_, i) => {
    const number = i + 1;
    return { number, severity: showingOn(number)[0]?.severity.value ?? 'OK' };
  });
})();

/**
 * Describes a list of stage numbers.
 *
 * @param numbers The stage numbers, in order.
 * @returns "All stages", "Stage 4" or "Stages 3, 4".
 */
export function stagesLabel(numbers: number[]): string {
  if (stageCount > 0 && numbers.length >= stageCount) return 'All stages';
  return `${numbers.length === 1 ? 'Stage' : 'Stages'} ${numbers.join(', ')}`;
}

/**
 * Names a timeline entry, so the yearly map can link to it.
 *
 * @param alert The alert.
 * @returns An element id, such as `tpto-psa-00000010`.
 */
export const alertAnchor = (alert: Alert) => alert.number.toLowerCase();

/**
 * Picks the alerts that covered a stage.
 *
 * @param stage The stage number, or null for every alert on the trail.
 * @returns The alerts, in the archive's order, newest first.
 */
export const stageAlerts = (stage: number | null): Alert[] =>
  stage === null ? alerts : alerts.filter((alert) => covers(alert, stage));

/**
 * Lists the alerts published for a stage in a window.
 *
 * @param stage The stage number, or null for the whole trail.
 * @param from The first day to include, as `YYYY-MM-DD`; open-ended when left out.
 * @param to The last day to include, as `YYYY-MM-DD`; open-ended when left out.
 * @returns The alerts in the window, newest first.
 */
export const stageTimeline = (stage: number | null, from?: string, to?: string): Alert[] =>
  stageAlerts(stage)
    .filter((alert) => {
      const day = localDay(new Date(alert.publishedAt));
      return (!from || day >= from) && (!to || day <= to);
    })
    .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));

export interface TrailSummary {
  severity: Severity | 'unknown';
  headline: string;
  detail: string;
}

const COUNT_WORD: Record<Severity, [string, string]> = {
  CLOSED: ['closure', 'closures'],
  PRECAUTION: ['precaution', 'precautions'],
  ADVISORY: ['advisory', 'advisories'],
  OK: ['notice', 'notices'],
};

export const trail: TrailSummary = (() => {
  if (!hasAlerts) {
    return { severity: 'unknown', headline: 'Not available yet', detail: 'Trail alerts will show here' };
  }
  const worst = current[0];
  const counts = [...SEVERITIES]
    .reverse()
    .map((sev) => [sev, current.filter((a) => a.severity.value === sev).length] as const)
    .filter(([, n]) => n > 0)
    .map(([sev, n]) => `${n} ${COUNT_WORD[sev][n === 1 ? 0 : 1]}`)
    .join(' · ');
  if (!worst || worst.severity.value === 'OK') {
    return { severity: 'OK', headline: 'Trail open', detail: counts || 'No active alerts' };
  }
  const closedStages = stages.filter((s) => s.severity === 'CLOSED').map((s) => s.number);
  const headline = {
    CLOSED:
      closedStages.length === stages.length
        ? 'Trail closed'
        : `${closedStages.length === 1 ? 'Stage' : 'Stages'} ${closedStages.join(', ')} closed`,
    PRECAUTION: 'Open with caution',
    ADVISORY: 'Open, with advisories',
  }[worst.severity.value];
  return { severity: worst.severity.value, headline, detail: counts };
})();
