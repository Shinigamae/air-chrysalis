/**
 * Homepage content — Figma "02 — Homepage" (4:3).
 *
 * Kept out of the template so the copy is editable in one place. These are a
 * personal status block and four navigational cards rather than a collection,
 * so they live in config; builds / games / books become real content
 * collections when those pages are built.
 *
 * When the .NET API arrives, `currentStatus` is the obvious first thing to
 * fetch rather than hard-code.
 */

export const hero = {
  eyebrow: '01 / HELLO',
  /** Rendered as stacked lines, one per array entry (Figma 4:50-4:53). */
  lines: ['CODE.', 'BUILD.', 'PLAY.', 'READ.'] as const,
  lead: 'Engineer by trade. The rest is to recreate.',
  intro:
    'I like making things — sometimes with code, sometimes with plastic, sometimes with a controller, sometimes with a good book.',
} as const;

export interface StatusItem {
  label: string;
  value: string;
}

export const currentStatus = {
  label: 'CURRENT STATUS',
  headline: 'WORKSHOP / ONLINE',
  /**
   * Rendered two-up, filling down each column before moving across, which is
   * how the Figma panel reads: BUILDING / PLAYING, then READING / NEXT BUILD.
   */
  items: [
    { label: 'BUILDING', value: 'Personal website' },
    { label: 'PLAYING', value: 'Where Winds Meet' },
    { label: 'READING', value: '—' },
    { label: 'NEXT BUILD', value: 'Gunpla' },
  ] satisfies StatusItem[],
} as const;

export const selectedWork = {
  eyebrow: '02 / SELECTED WORK',
  title: 'A FEW THINGS I MAKE',
  summary: 'Not a résumé. More like a record of what I am into right now.',
  cards: [
    {
      kicker: 'CODE',
      title: 'WORKSHOP',
      subtitle: 'Software / Projects',
      summary: 'Systems I build, break, refactor and occasionally ship.',
      href: '/workshop',
      image: '/images/home/workshop.jpg',
    },
    {
      kicker: 'BUILD',
      title: 'BUILD ARCHIVE',
      subtitle: 'Gunpla / Models',
      summary: 'A visual archive of kits, progress, details and finished builds.',
      href: '/builds',
      image: '/images/home/build-archive.jpg',
    },
    {
      kicker: 'PLAY',
      title: 'GAMING LOG',
      subtitle: 'PlayStation / Games',
      summary: 'What I am playing, what I think of it, and the screenshots worth keeping.',
      href: '/games',
      image: '/images/home/gaming-log.jpg',
    },
    {
      kicker: 'READ',
      title: 'READING LOG',
      subtitle: 'Books / Goodreads',
      summary: 'Books I have read, liked, disliked, and would recommend.',
      href: '/books',
      image: '/images/home/reading-log.jpg',
    },
  ],
} as const;

/** The affordance text on every homepage card. */
export const cardAction = 'VIEW →';
