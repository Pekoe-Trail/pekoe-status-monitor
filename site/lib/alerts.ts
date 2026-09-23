import { loadConfig } from '../../scripts/lib/config.ts';
import {
  CHANNELS,
  SEVERITIES,
  openAlerts,
  type Alert,
  type Channel,
  type Severity,
} from '../../scripts/lib/alerts.ts';
import { Store } from '../../scripts/lib/store.ts';
import { localDay } from '../../scripts/lib/time.ts';

export type { Alert, Channel, Severity };

const file = new Store(process.env.STATUS_DATA_DIR ?? 'data').readAlerts();
const stageCount = loadConfig().alerts?.stages ?? 0;

export const hasAlerts = !!file;
export const alertsUpdatedAt = file ? new Date(file.updatedAt) : null;
export const alerts: Alert[] = file?.alerts ?? [];
export const current: Alert[] = openAlerts(alerts);
export const past: Alert[] = alerts.filter((a) => a.status === 'CLOSED');

/**
 * The years the archive holds alerts for, for a stage page's year links.
 *
 * @returns The Sri Lanka calendar years, newest first, such as `['2026', '2025']`.
 */
export const alertYears: string[] = [
  ...new Set(alerts.map((alert) => localDay(new Date(alert.publishedAt)).slice(0, 4))),
].sort((a, b) => b.localeCompare(a));

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
 * @returns Its path, such as `/alerts/psa-0042`.
 */
export const alertHref = (alert: Alert) => `/alerts/${alert.number.toLowerCase()}`;

/**
 * Builds the link to a stage's page.
 *
 * @param stage The stage number.
 * @returns Its path, such as `/stages/4`.
 */
export const stageHref = (stage: number) => `/stages/${stage}`;

export const KIND_LABEL: Record<Alert['history'][number]['kind'], string> = {
  PUBLISHED: 'Published',
  UPDATED: 'Updated',
  CLOSED: 'Resolved',
};

export const CHANNEL_LABEL: Record<Channel, string> = {
  WEBSITE: 'Posted on the website',
  APP: 'Shown in the app',
  PUSH: 'Phone notification',
  EMAIL: 'Sent by email',
};

/**
 * Lists every channel an alert's updates went out on.
 *
 * @param alert The alert.
 * @returns The channels, in the order website, app, push, email.
 */
export const alertChannels = (alert: Alert): Channel[] =>
  CHANNELS.filter((channel) => alert.history.some((step) => step.channels.includes(channel)));

/**
 * Describes which stages an alert covers.
 *
 * @param alert The alert.
 * @returns "All stages", "Stage 4" or "Stages 3, 4", with stages in number order.
 */
export function where(alert: Alert): string {
  if (alert.scope === 'GLOBAL' || alert.stages.length === 0) return 'All stages';
  const numbers = alert.stages.map((s) => s.number).sort((a, b) => a - b);
  return `${numbers.length === 1 ? 'Stage' : 'Stages'} ${numbers.join(', ')}`;
}

/**
 * Tells whether an alert applies to a stage; an all-stages alert covers every stage.
 *
 * @param alert The alert.
 * @param stage The stage number.
 * @returns True when the alert covers the stage.
 */
export const covers = (alert: Alert, stage: number) =>
  alert.scope === 'GLOBAL' || alert.stages.some((s) => s.number === stage);

export interface StageView {
  number: number;
  /** The worst open severity on the stage; OK when nothing is open */
  severity: Severity;
  /** The most severe open alert on the stage, if any */
  alert: Alert | undefined;
}

export const stages: StageView[] = (() => {
  const highest = Math.max(stageCount, ...current.flatMap((a) => a.stages.map((s) => s.number)));
  return Array.from({ length: highest }, (_, i) => {
    const number = i + 1;
    const alert = current.find((a) => covers(a, number));
    return { number, severity: alert?.severity.value ?? 'OK', alert };
  });
})();

export interface StageStep {
  alert: Alert;
  step: Alert['history'][number];
}

/**
 * Names a timeline entry, so the yearly map can link to it.
 *
 * @param entry The update and its alert.
 * @returns An element id, such as `psa-0010-1760589000000`.
 */
export const stepAnchor = ({ alert, step }: StageStep) =>
  `${alert.number.toLowerCase()}-${Date.parse(step.createdAt)}`;

/**
 * Picks the alerts that covered a stage, including all-stages alerts.
 *
 * @param stage The stage number, or null for every alert on the trail.
 * @returns The alerts, in the archive's order, newest first.
 */
export const stageAlerts = (stage: number | null): Alert[] =>
  stage === null ? alerts : alerts.filter((alert) => covers(alert, stage));

/**
 * Lists every update of every alert that covered a stage, including all-stages alerts.
 *
 * @param stage The stage number, or null for the whole trail.
 * @param from The first day to include, as `YYYY-MM-DD`; open-ended when left out.
 * @param to The last day to include, as `YYYY-MM-DD`; open-ended when left out.
 * @returns The updates in the window, newest first, each with its alert.
 */
export const stageTimeline = (stage: number | null, from?: string, to?: string): StageStep[] =>
  stageAlerts(stage)
    .flatMap((alert) => alert.history.map((step) => ({ alert, step })))
    .filter(({ step }) => {
      const day = localDay(new Date(step.createdAt));
      return (!from || day >= from) && (!to || day <= to);
    })
    .sort((a, b) => Date.parse(b.step.createdAt) - Date.parse(a.step.createdAt));


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
      current.some((a) => a.severity.value === 'CLOSED' && a.scope === 'GLOBAL')
        ? 'Trail closed'
        : `${closedStages.length === 1 ? 'Stage' : 'Stages'} ${closedStages.join(', ')} closed`,
    PRECAUTION: 'Open with caution',
    ADVISORY: 'Open, with advisories',
  }[worst.severity.value];
  return { severity: worst.severity.value, headline, detail: counts };
})();

/**
 * Orders a PSA's history for its timeline.
 *
 * @param alert The alert.
 * @returns A copy of its history, oldest first.
 */
export const timeline = (alert: Alert) =>
  [...alert.history].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
