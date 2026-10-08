import { getCollection } from 'astro:content';

/**
 * The archive's numbers, counted from the collections at build time — the
 * homepage strip and the /lifestyle hub both print them, and a typed count
 * goes stale the first time a sync runs.
 *
 * JOURNEYS counts the travel albums only. The photo shelf also holds game
 * photo modes and sketches, and calling those journeys would overstate it.
 */
export async function lifestyleStats() {
  const [games, builds, books, albums] = await Promise.all([
    getCollection('games'),
    getCollection('builds'),
    getCollection('books'),
    getCollection('albums'),
  ]);

  return {
    games: games.length,
    platinums: games.filter((game) => game.data.platinum).length,
    builds: builds.length,
    books: books.length,
    journeys: albums.filter((album) => album.data.title.startsWith('ME AROUND')).length,
  };
}

export type LifestyleStats = Awaited<ReturnType<typeof lifestyleStats>>;

/** One figure per door, keyed by the door's href. */
export const statFor = (stats: LifestyleStats, href: string) =>
  ({
    '/builds': { value: stats.builds, label: 'BUILDS' },
    '/games': { value: stats.games, label: `GAMES · ${stats.platinums} PLATINUMS` },
    '/books': { value: stats.books, label: 'BOOKS' },
    '/journeys': { value: stats.journeys, label: 'JOURNEYS' },
  })[href];
