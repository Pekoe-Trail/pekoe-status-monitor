import type { Severity } from './alerts.ts';

/**
 * Lucide-style icon paths, drawn on a 24-unit grid with a 2-unit stroke: a tick, an info mark, a
 * warning sign and a no-entry sign for the severities.
 */
export const SEVERITY_ICON: Record<Severity, string> = {
  OK: 'M22 11.1V12a10 10 0 1 1-5.9-9.1M22 4 12 14l-3-3',
  ADVISORY: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 16v-4M12 8h.01',
  PRECAUTION: 'M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01',
  CLOSED: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM4.9 4.9l14.2 14.2',
};
