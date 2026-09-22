import rss from '@astrojs/rss';
import type { APIContext } from 'astro';
import { STATUS_LABEL, incidents } from '../../lib/incidents.ts';

/**
 * Serves the incidents RSS feed, one item per incident or maintenance, newest first.
 *
 * @param context The build context, which supplies the site URL for absolute links.
 * @returns The RSS response.
 */
export function GET(context: APIContext) {
  return rss({
    title: 'Pekoe Trail status: incidents',
    description: 'Outages and planned maintenance for the Pekoe Trail website, app and services.',
    site: context.site!,
    items: incidents.map((incident) => ({
      title: `[${STATUS_LABEL[incident.data.status]}] ${incident.data.title}`,
      link: `/incidents/${incident.id}/`,
      pubDate: incident.data.started,
      description: incident.body?.split(/\n\s*\n/).find((p) => p.trim()) ?? '',
    })),
  });
}
