import type { CollectionEntry } from 'astro:content';

/**
 * Shared vocabulary for ON ROTATION — the homepage's third section.
 *
 * Copy lives here rather than in the template, like `src/config/home.ts`, so
 * the section reads as one piece of writing instead of being spelled out
 * across markup.
 */

export type Rotation = CollectionEntry<'music'>;
export type Playlist = Rotation['data']['playlists'][number];

export const section = {
  eyebrow: '03 / ON ROTATION',
  title: 'WHAT I HAVE HAD ON',
  /**
   * Deliberately not "my favourite playlists", and no longer a play count.
   * It is what was last reached for, which is a smaller and more honest claim
   * than either — and unlike a chart it cannot be embarrassed by a bedtime
   * playlist someone else left running.
   */
  summary: 'Not a taste statement. Just what I last reached for.',
} as const;

/** The kicker under the section header. */
export const sourceLabel = 'MY PLAYLISTS / LAST PLAYED';

/**
 * Most recently played first. The file is written in order, but order is the
 * content here, so the page does not take it on trust.
 */
export const byRecency = (a: Playlist, b: Playlist) =>
  b.playedAt.localeCompare(a.playedAt);

/** Ordinal shown beside a row — "01", "02". */
export const rankOf = (index: number) => String(index + 1).padStart(2, '0');

/**
 * The embed player's URL for one playlist.
 *
 * `theme=0` is Spotify's dark embed, which is the only one that can sit on
 * this page without lighting a white panel in the middle of it.
 *
 * What this cannot do is play full tracks for a visitor who is not signed in
 * to Spotify — they get previews, and that is Spotify's rule, not a setting.
 */
export const embedUrl = (playlistId: string) =>
  `https://open.spotify.com/embed/playlist/${playlistId}?theme=0`;

/** ISO timestamp → "2026.09.12", the site's date idiom. */
export const syncedLabel = (iso: string | null) =>
  iso ? iso.slice(0, 10).replace(/-/g, '.') : '';

/** The same idiom for a play time, which is a date here and not a clock. */
export const playedLabel = (iso: string) => iso.slice(0, 10).replace(/-/g, '.');
