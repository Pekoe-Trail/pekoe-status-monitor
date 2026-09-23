import { SEVERITIES, type Alert, type Severity } from '../../scripts/lib/alerts.ts';
import { addDays } from '../../scripts/lib/time.ts';

/** A stage's colour at the end of one day, as the website banner showed it */
export interface DayColour {
  /** The Sri Lanka calendar date, as `YYYY-MM-DD` */
  date: string;
  severity: Severity;
  /** The numbers of the alerts open then, such as `PSA-0042` */
  alerts: string[];
}

/** How long one of an alert's severities was on the website banner */
interface Span {
  from: number;
  /** When the next banner step replaced it, or the alert closed; Infinity while it stands */
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
 * Works out what an alert put on the website banner, and for how long. Only steps sent to
 * the website count, because the banner keeps showing the last one sent to it: a push-only
 * or email-only step leaves the colour alone. A closing step ends the alert rather than
 * setting a colour.
 *
 * @param alert The alert.
 * @returns Its banner spans, oldest first; empty when it never went to the website.
 */
function spans(alert: Alert): Span[] {
  const steps = alert.history
    .filter((step) => step.kind !== 'CLOSED' && step.channels.includes('WEBSITE'))
    .map((step) => ({ at: Date.parse(step.createdAt), severity: step.severity.value }))
    .sort((a, b) => a.at - b.at);
  const closed = alert.closedAt ? Date.parse(alert.closedAt) : Infinity;
  return steps.map(({ at, severity }, i) => ({
    from: at,
    to: Math.min(steps[i + 1]?.at ?? Infinity, closed),
    severity,
    number: alert.number,
  }));
}

/**
 * Works out a stage's colour at the end of each day of a window, as the website banner
 * showed it. A colour carries over from day to day until a banner step changes it, and a
 * resolved alert leaves the stage Open. Today is read as of now.
 *
 * @param alerts The alerts covering the stage, including all-stages alerts.
 * @param window The days to work out, oldest first.
 * @param now The current instant, in milliseconds.
 * @returns The days that ended with an alert open, oldest first. A day with none ended Open,
 *   and a day still to come is left out.
 */
export function stageDays(alerts: Alert[], window: string[], now: number = Date.now()): DayColour[] {
  const all = alerts.flatMap(spans);
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
