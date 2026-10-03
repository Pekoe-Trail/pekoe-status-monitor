import { SEVERITIES, type Alert, type Severity } from '../../scripts/lib/alerts.ts';
import { addDays } from '../../scripts/lib/time.ts';

/** A stage's colour at the end of one day, as the website banner showed it */
export interface DayColour {
  /** The Sri Lanka calendar date, as `YYYY-MM-DD` */
  date: string;
  severity: Severity;
  /** The numbers of the alerts open then, such as `TPTO-PSA-00000042` */
  alerts: string[];
}

/** How long an alert stood on the website banner */
export interface Span {
  from: number;
  /** When a newer alert of the same lane replaced it; Infinity while it stands */
  to: number;
  severity: Severity;
  number: string;
}

/**
 * The first instant of a Sri Lanka calendar day.
 *
 * @param day The date as `YYYY-MM-DD`.
 * @returns Milliseconds since the epoch.
 */
const dayStart = (day: string) => Date.parse(`${day}T00:00:00+05:30`);

/**
 * Lists the days of a window.
 *
 * @param from The first day, as `YYYY-MM-DD`.
 * @param to The last day, as `YYYY-MM-DD`.
 * @returns Every day from `from` to `to`, oldest first; empty when `to` is before `from`.
 */
export function days(from: string, to: string): string[] {
  const list: string[] = [];
  for (let day = from; day <= to; day = addDays(day, 1)) list.push(day);
  return list;
}

/**
 * Works out what the alerts of one lane — one incident on one stage — put on the website
 * banner, and for how long. Only alerts sent to the website count, because the banner keeps
 * showing the last one sent to it: a push-only or email-only alert leaves the colour alone.
 * An OK alert takes the stage out of the incident, so it ends the one before it without
 * setting a colour of its own.
 *
 * @param alerts The lane's alerts.
 * @returns The lane's banner spans, oldest first.
 */
export function spans(alerts: Alert[]): Span[] {
  const shown = alerts
    .filter((alert) => alert.channels.includes('WEBSITE'))
    .map((alert) => ({
      at: Date.parse(alert.publishedAt),
      severity: alert.severity.value,
      number: alert.number,
    }))
    .sort((a, b) => a.at - b.at);
  return shown
    .map(({ at, severity, number }, i) => ({
      from: at,
      to: shown[i + 1]?.at ?? Infinity,
      severity,
      number,
    }))
    .filter((span) => span.severity !== 'OK');
}

/**
 * Works out a stage's colour at the end of each day of a window, as the website banner
 * showed it. Each incident on the stage keeps its colour from day to day until a newer alert
 * of that incident there changes it, and an OK alert takes it off the stage. Overlapping
 * incidents show the worst of them. Today is read as of now.
 *
 * @param alerts The alerts covering the stage.
 * @param window The days to work out, oldest first.
 * @param stage The stage, or null for the whole trail, which shows the worst of every stage.
 * @param now The current instant, in milliseconds.
 * @returns The days that ended with an alert open, oldest first. A day with none ended Open,
 *   and a day still to come is left out.
 */
export function stageDays(
  alerts: Alert[],
  window: string[],
  stage: number | null,
  now: number = Date.now(),
): DayColour[] {
  const lanes = new Map<string, Alert[]>();
  for (const alert of alerts) {
    for (const { number } of alert.stages) {
      if (stage !== null && number !== stage) continue;
      const key = `${number} ${alert.incident.id}`;
      lanes.set(key, [...(lanes.get(key) ?? []), alert]);
    }
  }
  const all = [...lanes.values()].flatMap(spans);
  const colours: DayColour[] = [];
  for (const date of window) {
    if (dayStart(date) > now) break;
    const at = Math.min(dayStart(addDays(date, 1)), now);
    const open = all
      .filter((span) => span.from <= at && span.to > at)
      .sort((a, b) => SEVERITIES.indexOf(b.severity) - SEVERITIES.indexOf(a.severity));
    if (open.length > 0) {
      colours.push({
        date,
        severity: open[0].severity,
        alerts: [...new Set(open.map((span) => span.number))].sort(),
      });
    }
  }
  return colours;
}
