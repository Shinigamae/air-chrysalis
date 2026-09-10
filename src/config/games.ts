import type { CollectionEntry } from 'astro:content';
import { withBase } from '@/config/site';

/**
 * Shared vocabulary for the Gaming Log, used by both the index and the
 * per-status routes so the two cannot drift apart.
 */

export type Game = CollectionEntry<'games'>;

/**
 * Slice by how the game was played, not by archive status — "finished" and
 * "in progress" are what you actually want to cut a games log by.
 */
export const PLAY_LABELS = {
  'in-progress': 'IN PROGRESS',
  finished: 'FINISHED',
  played: 'PLAYED',
  backlog: 'BACKLOG',
  abandoned: 'ABANDONED',
} as const;

export type PlayStatus = keyof typeof PLAY_LABELS;

export const PLAY_KEYS = Object.keys(PLAY_LABELS) as PlayStatus[];

/** How many cards a page of the grid holds. */
export const PAGE_SIZE = 48;

/**
 * Newest first. `lastPlayedOn` is a real date where the year alone ties, and
 * with 300-odd imported games year-only sorting left whole years arbitrary.
 */
export function byRecency(a: Game, b: Game) {
  const key = (g: Game) => g.data.lastPlayedOn ?? `${g.data.year}-01-01`;
  return key(b).localeCompare(key(a));
}

export const ratingOf = (rating: number | null | undefined) =>
  rating === null || rating === undefined ? '—' : `${rating} / 10`;

/** Own captures first, then PSN's store art, then the trophy-set icon. */
export const imageOf = (game: Game) =>
  game.data.screenshots[0] ?? game.data.art ?? game.data.icon;

/**
 * `rating` and `review` are override-only and empty until written, so the
 * card falls back to what PSN does know — completion, hours, a platinum.
 */
export const metaOf = (game: Game) =>
  [
    `${game.data.progress}%`,
    game.data.playtimeHours ? `${Math.round(game.data.playtimeHours)} H` : null,
    game.data.platinum ? 'PLATINUM' : null,
    game.data.rating ? `RATING ${ratingOf(game.data.rating)}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

/**
 * Facet links for the rail beside the section header.
 *
 * These are real routes, not a client-side filter. With a handful of games
 * hiding cards in the browser was fine; across 300 it is not — the grid is
 * paginated, so a filter that only reached the current page would show
 * "FINISHED / 100" and then reveal the four that happen to sit on this page.
 *
 * `games` must therefore be the same population the grids paginate: with the
 * featured "currently playing" entry already removed. Counting over the full
 * collection put "IN PROGRESS / 03" above a page holding two, because the
 * featured game is itself in progress and appears in no grid.
 */
export function facetsFor(games: Game[], active: PlayStatus | 'all') {
  const pad = (n: number) => String(n).padStart(2, '0');
  const countOf = (key: PlayStatus) =>
    games.filter((g) => g.data.playStatus === key).length;

  return [
    {
      key: 'all' as const,
      label: `ALL / ${pad(games.length)}`,
      href: withBase('/games'),
      active: active === 'all',
    },
    ...PLAY_KEYS.map((key) => ({
      key,
      count: countOf(key),
      label: `${PLAY_LABELS[key]} / ${pad(countOf(key))}`,
      href: withBase(`/games/status/${key}`),
      active: active === key,
    })).filter((facet) => facet.count > 0),
  ];
}
