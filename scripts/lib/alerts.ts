import { z } from 'zod';

export const SEVERITIES = ['OK', 'ADVISORY', 'PRECAUTION', 'CLOSED'] as const;
export type Severity = (typeof SEVERITIES)[number];

/** The channels a PSA update can go out on, in the SOP's order. */
export const CHANNELS = ['WEBSITE', 'APP', 'PUSH', 'EMAIL'] as const;
export type Channel = (typeof CHANNELS)[number];

const severity = z.object({ value: z.enum(SEVERITIES), label: z.string() });

/** The channels of an update; one this page doesn't know is dropped, not a reason to skip the PSA. */
const channels = z
  .array(z.string())
  .default([])
  .transform((list) => CHANNELS.filter((channel) => list.includes(channel)));

const date = z.iso.datetime({ offset: true });

const alert = z.object({
  id: z.string(),
  number: z.string(),
  scope: z.enum(['GLOBAL', 'STAGE']),
  status: z.enum(['OPEN', 'CLOSED']),
  severity,
  category: z.object({ label: z.string() }),
  reason: z.string().nullish(),
  title: z.string().nullish(),
  impact: z.string().nullish(),
  action: z.string().nullish(),
  link: z.url().nullish(),
  linkLabel: z.string().nullish(),
  stages: z.array(z.object({ number: z.number() })).default([]),
  publishedAt: date,
  updatedAt: date,
  closedAt: date.nullish(),
  resolution: z.string().nullish(),
  history: z
    .array(
      z.object({
        kind: z.enum(['PUBLISHED', 'UPDATED', 'CLOSED']),
        severity,
        createdAt: date,
        title: z.string().nullish(),
        message: z.string().nullish(),
        channels,
      }),
    )
    .default([]),
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
 * Drops an alert's link unless it is `https://`, so a bad link can't become a script URL.
 *
 * @param item The alert.
 * @returns The alert, or a copy with `link` set to null.
 */
function safeLink(item: Alert): Alert {
  return item.link && !item.link.startsWith('https://') ? { ...item, link: null } : item;
}

/**
 * Reads the alert history, newest first, up to `maxPages` pages of 50. Throws when the API
 * can't be reached or answers with something unexpected; a non-2xx answer throws an error
 * whose message is only `HTTP <status>`.
 *
 * @param url The public history endpoint.
 * @param options.timeoutMs How long to wait for each page.
 * @param options.maxPages The most pages to read.
 * @param options.updatedSince Read only the alerts changed at or after this instant.
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
    alerts.push(...found.map(safeLink));
    pageNumber = next;
  }
  return alerts;
}

/**
 * Gives the watermark for the next read: the newest change the archive has seen. An alert's
 * `updatedAt` moves when it is published, updated or closed, so asking for everything from
 * this instant onwards catches a closure of an old alert as well as a new one.
 *
 * @param alerts The archive.
 * @returns The newest `updatedAt`, or undefined when the archive is empty.
 */
export function lastUpdatedAt(alerts: Alert[]): string | undefined {
  return alerts.reduce<string | undefined>(
    (newest, alert) => (!newest || alert.updatedAt > newest ? alert.updatedAt : newest),
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
 * Picks the open alerts and orders them for display.
 *
 * @param alerts Every alert.
 * @returns The open alerts, most severe first, then most recently updated.
 */
export function openAlerts(alerts: Alert[]): Alert[] {
  /**
   * Ranks an alert by severity.
   *
   * @param a The alert.
   * @returns Its position in SEVERITIES; higher is more severe.
   */
  const rank = (a: Alert) => SEVERITIES.indexOf(a.severity.value);
  return alerts
    .filter((a) => a.status === 'OPEN')
    .sort((a, b) => rank(b) - rank(a) || Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
}
