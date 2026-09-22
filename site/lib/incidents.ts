import { getCollection, type CollectionEntry } from 'astro:content';

export type Incident = CollectionEntry<'incidents'>;

export const STATUS_LABEL: Record<Incident['data']['status'], string> = {
  investigating: 'Investigating',
  identified: 'Identified',
  monitoring: 'Monitoring',
  resolved: 'Resolved',
  scheduled: 'Scheduled',
  'in-progress': 'In progress',
  completed: 'Completed',
};

export const incidents: Incident[] = (await getCollection('incidents')).sort(
  (a, b) => b.data.started.getTime() - a.data.started.getTime(),
);

const now = new Date();

export const active = incidents.filter(({ data }) =>
  data.type === 'incident'
    ? data.status !== 'resolved'
    : data.status === 'in-progress' || (data.status === 'scheduled' && data.started <= now && now <= data.ended!),
);

export const upcoming = incidents
  .filter(({ data }) => data.type === 'maintenance' && data.status === 'scheduled' && data.started > now)
  .reverse();

/**
 * Lists the finished incidents and maintenance that started in the last few days.
 *
 * @param days How many days back to go.
 * @returns Those incidents, newest first; active and upcoming ones are left out.
 */
export function recentPast(days: number): Incident[] {
  const since = now.getTime() - days * 24 * 60 * 60_000;
  return incidents.filter(
    (i) => !active.includes(i) && !upcoming.includes(i) && i.data.started.getTime() >= since,
  );
}

/**
 * Lists the incidents and maintenance that name a system.
 *
 * @param id The system id.
 * @returns Those incidents, newest first.
 */
export function forSystem(id: string): Incident[] {
  return incidents.filter((i) => i.data.systems.includes(id));
}
