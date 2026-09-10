import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';
import type { APIContext } from 'astro';
import { site, withBase } from '@/config/site';

/**
 * One feed for the whole archive — builds, games, books and projects — newest
 * first. A personal archive that updates in four places is more useful as a
 * single feed than four sparse ones.
 *
 * Dates are best-effort. The collections store what a human would write
 * (`2026-08` for a build month, a bare year for a game), not timestamps, so
 * partial values are widened to the first of the month or the first of the
 * year. That keeps ordering sensible without inventing false precision.
 */

/** '2026-08-14' | '2026-08' | 2026 -> a Date, or undefined if unusable. */
function toDate(value: string | number | undefined | null): Date | undefined {
  if (value === undefined || value === null) return undefined;
  const text = String(value);
  const iso =
    /^\d{4}$/.test(text) ? `${text}-01-01`
    : /^\d{4}-\d{2}$/.test(text) ? `${text}-01`
    : text;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

export async function GET(context: APIContext) {
  const [builds, games, books, projects] = await Promise.all([
    getCollection('builds'),
    getCollection('games'),
    getCollection('books'),
    getCollection('projects'),
  ]);

  const items = [
    ...builds.map((entry) => ({
      title: `BUILD / ${entry.data.title}`,
      // A photo-only post has no prose; fall back to the kit's identity so the
      // item is not published with an empty description.
      description:
        entry.data.summary ||
        [entry.data.manufacturer, entry.data.scale, entry.data.kind].filter(Boolean).join(' · '),
      link: withBase(`/builds/${entry.id}`),
      pubDate: toDate(entry.data.buildDate),
      // grade is unset for makers with no product line; drop it rather than
      // emitting an empty <category/>.
      categories: ['builds', entry.data.grade].filter((c): c is string => Boolean(c)),
    })),
    ...games.map((entry) => ({
      title: `PLAY / ${entry.data.title}`,
      description: entry.data.review,
      link: withBase(`/games/${entry.id}`),
      pubDate: toDate(entry.data.year),
      categories: ['games', entry.data.platform],
    })),
    ...books.map((entry) => ({
      title: `READ / ${entry.data.title}`,
      description: entry.data.thought,
      link: withBase(`/books/${entry.id}`),
      pubDate: toDate(entry.data.finishedOn),
      categories: ['books'],
    })),
    ...projects.map((entry) => ({
      title: `CODE / ${entry.data.title}`,
      description: entry.data.subtitle,
      link: withBase('/workshop'),
      pubDate: toDate(entry.data.year),
      categories: ['workshop'],
    })),
  ]
    // Undated entries sort last rather than being dropped.
    .sort((a, b) => (b.pubDate?.getTime() ?? 0) - (a.pubDate?.getTime() ?? 0));

  // `context.site` is the bare origin, so the base has to be folded in or the
  // channel link points at a 404 while the item links are correct.
  const origin = context.site ?? new URL('https://shinigamae.github.io');
  const channelSite = new URL(import.meta.env.BASE_URL, origin);

  return rss({
    title: site.name,
    description: site.description,
    site: channelSite,
    items,
    customData: '<language>en</language>',
  });
}
