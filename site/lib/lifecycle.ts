import { SEVERITIES, type Alert, type Severity } from '../../scripts/lib/alerts.ts';
import { spans, type Span } from './calendar.ts';

export type IncidentState = 'live' | 'cleared' | 'closed';

export interface IncidentStory {
  incident: Alert['incident'];
  category: string;
  state: IncidentState;
  severity: Severity;
  alerts: Alert[];
  latest: Alert;
  openedAt: string;
  endedAt: string | null;
  liveOn: number[];
  spans: Span[];
}

/**
 * Ranks a severity.
 *
 * @param severity The severity.
 * @returns Its position in SEVERITIES; higher is more severe.
 */
const rank = (severity: Severity) => SEVERITIES.indexOf(severity);

/**
 * Tells whether an alert applies to a stage.
 *
 * @param alert The alert.
 * @param stage The stage number, or null for the whole trail.
 * @returns True when the alert covers the stage, or always for the whole trail.
 */
const onStage = (alert: Alert, stage: number | null) =>
  stage === null || alert.stages.some((s) => s.number === stage);

/**
 * Tells each incident's story on a stage: where it is in its lifecycle, the alerts published
 * about it there, and how the website banner showed it. An incident is live on a stage while
 * its newest alert there isn't OK and it is open, the way the register decides what a page
 * shows; its status comes from its newest alert, the only copy read after it last changed.
 *
 * @param alerts Every alert, in any order.
 * @param stage The stage number, or null for the whole trail.
 * @returns One story per incident with an alert on the stage: live ones first, worst and then
 *   most recently updated first, then the ended ones, most recently ended first.
 */
export function incidentStories(alerts: Alert[], stage: number | null): IncidentStory[] {
  const byIncident = new Map<string, Alert[]>();
  for (const alert of [...alerts].sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))) {
    byIncident.set(alert.incident.id, [...(byIncident.get(alert.incident.id) ?? []), alert]);
  }
  const stories: IncidentStory[] = [];
  for (const all of byIncident.values()) {
    const here = all.filter((alert) => onStage(alert, stage));
    if (here.length === 0) continue;
    const open = all[0].incident.status === 'OPEN';
    const lanes = new Map<number, Alert[]>();
    for (const alert of all) {
      for (const { number } of alert.stages) lanes.set(number, [...(lanes.get(number) ?? []), alert]);
    }
    const newest = new Map([...lanes].map(([number, list]) => [number, list[0]]));
    const liveOn = [...newest]
      .filter(([, alert]) => open && alert.severity.value !== 'OK')
      .map(([number]) => number)
      .sort((a, b) => a - b);
    const scope = stage === null ? liveOn : liveOn.filter((number) => number === stage);
    const state: IncidentState = scope.length > 0 ? 'live' : open ? 'cleared' : 'closed';
    const shown = scope.map((number) => newest.get(number)!.severity.value);
    stories.push({
      incident: all[0].incident,
      category: all[0].category.label,
      state,
      severity:
        state === 'live'
          ? shown.reduce((w, sev) => (rank(sev) > rank(w) ? sev : w))
          : (here.find((a) => a.severity.value !== 'OK')?.severity.value ?? 'OK'),
      alerts: here,
      latest: here[0],
      openedAt: all.at(-1)!.publishedAt,
      endedAt: state === 'closed' ? all[0].publishedAt : state === 'cleared' ? here[0].publishedAt : null,
      liveOn,
      spans: [...lanes]
        .filter(([number]) => stage === null || number === stage)
        .flatMap(([, list]) => spans(list))
        .sort((a, b) => a.from - b.from),
    });
  }
  const order: Record<IncidentState, number> = { live: 0, cleared: 1, closed: 1 };
  return stories.sort(
    (a, b) =>
      order[a.state] - order[b.state] ||
      (a.state === 'live'
        ? rank(b.severity) - rank(a.severity) || Date.parse(b.alerts[0].publishedAt) - Date.parse(a.alerts[0].publishedAt)
        : Date.parse(b.endedAt!) - Date.parse(a.endedAt!)),
  );
}

/**
 * Narrows the stories to a window: the incidents with an alert published in it, or shown on
 * the banner during it, each keeping only the alerts published in it.
 *
 * @param stories The stories.
 * @param from The window's first instant, in milliseconds.
 * @param to The window's last instant, in milliseconds.
 * @returns The stories that touch the window, in the same order.
 */
export function storiesBetween(stories: IncidentStory[], from: number, to: number): IncidentStory[] {
  return stories
    .map((story) => ({
      ...story,
      alerts: story.alerts.filter((alert) => {
        const at = Date.parse(alert.publishedAt);
        return at >= from && at <= to;
      }),
    }))
    .filter((story) => story.alerts.length > 0 || story.spans.some((span) => span.from <= to && span.to >= from));
}

/**
 * Says how long something lasted, in whole days, or hours under a day.
 *
 * @param from When it started, in milliseconds.
 * @param to When it ended, in milliseconds.
 * @returns Text such as "12 days", "1 day" or "5 hours".
 */
export function duration(from: number, to: number): string {
  const hours = Math.max(0, Math.round((to - from) / 3_600_000));
  if (hours < 24) return `${hours} ${hours === 1 ? 'hour' : 'hours'}`;
  const days = Math.round(hours / 24);
  return `${days} ${days === 1 ? 'day' : 'days'}`;
}
