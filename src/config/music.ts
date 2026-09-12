import type { CollectionEntry } from 'astro:content';

/**
 * Shared vocabulary for ON ROTATION — the homepage's third section.
 *
 * Copy lives here rather than in the template, like `src/config/home.ts`, so
 * the section reads as one piece of writing instead of being spelled out
 * across markup.
 */

export type Rotation = CollectionEntry<'music'>;
export type Track = Rotation['data']['tracks'][number];

/**
 * Spotify's three windows, in their words rather than ours.
 *
 * The label is part of the claim: "most played" with no window attached is
 * meaningless, and "last 4 weeks" is what `short_term` actually means —
 * roughly, and Spotify says so itself, which is why the copy hedges.
 */
export const RANGE_LABELS = {
  short_term: 'LAST 4 WEEKS',
  medium_term: 'LAST 6 MONTHS',
  long_term: 'ALL TIME',
} as const;

export const section = {
  eyebrow: '03 / ON ROTATION',
  title: 'WHAT I HAVE HAD ON',
  /**
   * Deliberately not "my favourite songs". It is a play count, which is a
   * different and less flattering thing — a song is often at the top because
   * it was on while something else was happening.
   */
  summary: 'Not a taste statement. Just what the play counts say.',
} as const;

/** The kicker under the section header — "MOST PLAYED / LAST 4 WEEKS". */
export const sourceLabel = (data: Rotation['data']) =>
  data.source === 'recent'
    ? 'RECENTLY PLAYED'
    : `MOST PLAYED / ${RANGE_LABELS[data.range ?? 'short_term']}`;

/** Rank ascending — the file is written in order, but order is the content
 *  here, so the page does not take it on trust. */
export const byRank = (a: Track, b: Track) => a.rank - b.rank;

export const rankOf = (track: Track) => String(track.rank).padStart(2, '0');

/** Spotify credits every featured artist; the row has room for the line. */
export const artistsOf = (track: Track) => track.artists.join(', ');

/** M:SS. Mono and tabular in the markup, so the colons line up down the column. */
export function durationOf(ms: number) {
  const total = Math.round(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/**
 * The embed player's URL for one track.
 *
 * `theme=0` is Spotify's dark embed, which is the only one that can sit on
 * this page without lighting a white panel in the middle of it.
 *
 * What this cannot do is play a full track for a visitor who is not signed
 * in to Spotify — they get the 30-second preview, and that is Spotify's rule,
 * not a setting. Worth knowing before wondering why it stops.
 */
export const embedUrl = (trackId: string) =>
  `https://open.spotify.com/embed/track/${trackId}?theme=0`;

/** ISO timestamp → "2026.09.12", the site's date idiom. */
export const syncedLabel = (iso: string | null) =>
  iso ? iso.slice(0, 10).replace(/-/g, '.') : '';
