import { z } from 'zod';

export const SEVERITIES = ['OK', 'ADVISORY', 'PRECAUTION', 'CLOSED'] as const;
export type Severity = (typeof SEVERITIES)[number];

/** The channels a PSA can go out on, in the SOP's order. */
export const CHANNELS = ['WEBSITE', 'HOMEPAGE', 'APP', 'PUSH', 'EMAIL'] as const;
export type Channel = (typeof CHANNELS)[number];

const severity = z.object({ value: z.enum(SEVERITIES), label: z.string() });

/** The channels of a PSA; one this page doesn't know is dropped, not a reason to skip it. */
const channels = z
  .array(z.string())
  .default([])
  .transform((list) => CHANNELS.filter((channel) => list.includes(channel)));

const date = z.iso.datetime({ offset: true });

const alert = z.object({
  id: z.string(),
  number: z.string(),
  severity,
  category: z.object({ label: z.string() }),
  incident: z.object({
    id: z.string(),
    number: z.string(),
    description: z.string(),
    status: z.enum(['OPEN', 'CLOSED']),
  }),
  title: z.string().nullish(),
  impact: z.string().nullish(),
  action: z.string().nullish(),
  links: z.array(z.object({ url: z.url(), label: z.string().nullish() })).default([]),
  stages: z.array(z.object({ number: z.number() })).default([]),
  publishedAt: date,
  channels,
});

export type Alert = z.infer<typeof alert>;

/** The saved trail alerts: `data/alerts/` */
export interface AlertsFile {
  /** When the history was last read from the API */
  updatedAt: string;
  alerts: Alert[];
}

const page = z.object({
  data: z.object({
    data: z.array(z.unknown()),
    meta: z.object({ next: z.number().int().nullable() }),
  }),
});

/**
 * Validates one page of the API's alert history. Only the fields the page shows are kept,
 * and a PSA that doesn't match the expected shape is skipped rather than failing the page.
 *
 * @param body The parsed JSON response, shaped `{ data: { data: [...], meta: { next } } }`.
 * @returns The valid alerts on the page, and the next page number, or null on the last.
 */
export function parsePage(body: unknown): { alerts: Alert[]; next: number | null } {
  const { data } = page.parse(body);
  const alerts = data.data.flatMap((item) => {
    const parsed = alert.safeParse(item);
    return parsed.success ? [parsed.data] : [];
  });
  return { alerts, next: data.meta.next };
}

/**
 * Drops an alert's links unless they are `https://`, so a bad link can't become a script URL.
 *
 * @param item The alert.
 * @returns The alert, keeping only its `https://` links.
 */
function safeLinks(item: Alert): Alert {
  return { ...item, links: item.links.filter((link) => link.url.startsWith('https://')) };
}

/**
 * Reads the alert history, newest first, up to `maxPages` pages of 50. Throws when the API
 * can't be reached or answers with something unexpected; a non-2xx answer throws an error
 * whose message is only `HTTP <status>`.
 *
 * @param url The public history endpoint.
 * @param options.timeoutMs How long to wait for each page.
 * @param options.maxPages The most pages to read.
 * @param options.updatedSince Read only the alerts published at or after this instant.
 * @returns The alerts from every page read, with non-https links removed.
 */
export async function fetchAlerts(
  url: string,
  { timeoutMs, maxPages, updatedSince }: { timeoutMs: number; maxPages: number; updatedSince?: string },
): Promise<Alert[]> {
  const alerts: Alert[] = [];
  let pageNumber: number | null = 1;
  while (pageNumber && pageNumber <= maxPages) {
    const pageUrl = new URL(url);
    pageUrl.searchParams.set('perPage', '50');
    pageUrl.searchParams.set('pageNumber', String(pageNumber));
    if (updatedSince) pageUrl.searchParams.set('updatedSince', updatedSince);
    const res = await fetch(pageUrl, {
      headers: { accept: 'application/json', 'user-agent': 'pekoe-status' },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const { alerts: found, next } = parsePage(await res.json());
    alerts.push(...found.map(safeLinks));
    pageNumber = next;
  }
  return alerts;
}

/**
 * Gives the watermark for the next read: the newest alert the archive has seen. An alert is
 * published once and never edited, so its publication time is all a reader has to catch up
 * on.
 *
 * @param alerts The archive.
 * @returns The newest `publishedAt`, or undefined when the archive is empty.
 */
export function lastPublishedAt(alerts: Alert[]): string | undefined {
  return alerts.reduce<string | undefined>(
    (newest, alert) => (!newest || alert.publishedAt > newest ? alert.publishedAt : newest),
    undefined,
  );
}

/**
 * Merges a read of the alert history into the archive. The archive only ever grows: an alert
 * the API no longer returns, because the read is capped at `maxPages` or it was removed from
 * the register, is kept as it was last seen.
 *
 * @param archive The alerts saved so far.
 * @param fetched The alerts just read, which replace the saved copy of the same alert.
 * @returns Every alert, newest first by the time it was published.
 */
export function mergeAlerts(archive: Alert[], fetched: Alert[]): Alert[] {
  const byId = new Map(archive.map((alert) => [alert.id, alert]));
  for (const alert of fetched) byId.set(alert.id, alert);
  return [...byId.values()].sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
}

/**
 * Picks the alerts the trail shows now, the way the API's register does. Each stage shows
 * the newest alert of every open incident on it, unless that alert is OK; a stage with none
 * of those shows its newest alert when it is an OK, as the all-clear. An incident closes only
 * through an OK alert, so the newest copy of any of its alerts gives its status.
 *
 * @param alerts Every alert.
 * @returns The alerts still showing, most severe first, then most recently published.
 */
export function currentAlerts(alerts: Alert[]): Alert[] {
  /**
   * Ranks an alert by severity.
   *
   * @param a The alert.
   * @returns Its position in SEVERITIES; higher is more severe.
   */
  const rank = (a: Alert) => SEVERITIES.indexOf(a.severity.value);
  const newest = [...alerts].sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
  const incidentStatus = new Map<string, Alert['incident']['status']>();
  for (const alert of newest) {
    if (!incidentStatus.has(alert.incident.id)) incidentStatus.set(alert.incident.id, alert.incident.status);
  }
  const showing = new Set<Alert>();
  for (const stage of new Set(newest.flatMap((a) => a.stages.map((s) => s.number)))) {
    const onStage = newest.filter((alert) => alert.stages.some((s) => s.number === stage));
    const lanes = new Map<string, Alert>();
    for (const alert of onStage) if (!lanes.has(alert.incident.id)) lanes.set(alert.incident.id, alert);
    const active = [...lanes.values()].filter(
      (alert) => alert.severity.value !== 'OK' && incidentStatus.get(alert.incident.id) === 'OPEN',
    );
    for (const alert of active) showing.add(alert);
    if (active.length === 0 && onStage[0]?.severity.value === 'OK') showing.add(onStage[0]);
  }
  return [...showing].sort(
    (a, b) => rank(b) - rank(a) || Date.parse(b.publishedAt) - Date.parse(a.publishedAt),
  );
}
