import { active } from '../lib/incidents.ts';
import { overall, systems, updatedAt } from '../lib/status.ts';

/**
 * Serves `/status.json`: the overall status, every system's current state and uptime, and
 * the active incidents, for anyone who wants to read them from code.
 *
 * @returns The JSON response.
 */
export function GET() {
  const body = {
    updatedAt: updatedAt?.toISOString() ?? null,
    overall,
    systems: systems.map(({ config, state, status, uptime }) => ({
      id: config.id,
      name: config.name,
      group: config.group,
      status,
      checkedAt: state?.checkedAt ?? null,
      responseMs: state?.ms ?? null,
      uptime,
    })),
    activeIncidents: active.map(({ id, data }) => ({
      id,
      title: data.title,
      type: data.type,
      status: data.status,
      systems: data.systems,
      started: data.started.toISOString(),
      url: `https://status.thepekoetrail.org/incidents/${id}/`,
    })),
  };
  return new Response(JSON.stringify(body, null, 2), {
    headers: { 'Content-Type': 'application/json' },
  });
}
