import { navigation } from './site';

/*
 * Card art is imported, not referenced by path, so it goes through
 * astro:assets: the build resizes and re-encodes each photo and the card
 * serves a srcset. The originals live in src/assets/home/ for that reason —
 * anything in public/ is copied out byte for byte. See IMAGES.md.
 */
import buildArchiveImage from '@/assets/home/build-archive.jpg';
import gamingLogImage from '@/assets/home/gaming-log.jpg';
import readingLogImage from '@/assets/home/reading-log.jpg';
import workshopImage from '@/assets/home/workshop.jpg';

/**
 * Homepage content — Figma "02 — Homepage" (4:3).
 *
 * Kept out of the template so the copy is editable in one place.
 *
 * The four cards do not carry their own descriptions. Each one is a door to a
 * section, and the section already has a line describing itself in
 * `navigation` — writing it twice meant the homepage and the page it linked
 * to could disagree about what the section was for, and for a while they did.
 */

/** The section's own tagline, so a card and its destination cannot drift. */
function summaryFor(href: string): string {
  const entry = navigation.find((nav) => nav.href === href);
  if (!entry) throw new Error(`No navigation entry for ${href}`);
  return entry.summary;
}

export const hero = {
  eyebrow: '01 / HELLO',
  /** Rendered as stacked lines, one per array entry (Figma 4:50-4:53). */
  lines: ['CODE.', 'BUILD.', 'PLAY.', 'READ.'] as const,
  lead: 'Engineer by trade. The rest is to recreate.',
  /** Reads directly off the four words stacked beside it. */
  intro: 'One of these pays the bills. The other three explain where the evenings went.',
} as const;

export interface StatusItem {
  label: string;
  value: string;
}

/**
 * The status panel is half declared and half observed.
 *
 * `PLAYING` and `READING` are filled in from the collections by the homepage,
 * because the syncs already know the answer and a hand-typed one goes stale
 * silently — this panel claimed a game the gaming log had not shown as
 * current for months. `BUILDING` and `NEXT BUILD` stay here: they are
 * intentions, and no feed can tell you what you mean to do next.
 */
export const currentStatus = {
  label: 'CURRENT STATUS',
  headline: 'WORKSHOP / ONLINE',
  building: { label: 'BUILDING', value: 'Personal website' } satisfies StatusItem,
  nextBuild: { label: 'NEXT BUILD', value: 'Qubeley Mk. II' } satisfies StatusItem,
  /** Shown when nothing on a shelf is marked current. */
  idle: '—',
} as const;

export const selectedWork = {
  eyebrow: '02 / SELECTED WORK',
  title: 'A FEW THINGS I MAKE',
  summary: 'Not a résumé. A record of where the time goes.',
  cards: [
    {
      kicker: 'CODE',
      title: 'WORKSHOP',
      subtitle: 'Software / Projects',
      href: '/workshop',
      summary: summaryFor('/workshop'),
      image: workshopImage,
    },
    {
      kicker: 'BUILD',
      title: 'BUILD ARCHIVE',
      subtitle: 'Gunpla / Models',
      href: '/builds',
      summary: summaryFor('/builds'),
      image: buildArchiveImage,
    },
    {
      kicker: 'PLAY',
      title: 'GAMING LOG',
      subtitle: 'PlayStation / Games',
      href: '/games',
      summary: summaryFor('/games'),
      image: gamingLogImage,
    },
    {
      kicker: 'READ',
      title: 'READING LOG',
      subtitle: 'Books / Goodreads',
      href: '/books',
      summary: summaryFor('/books'),
      image: readingLogImage,
    },
  ],
} as const;

/** The affordance text on every homepage card. */
export const cardAction = 'VIEW →';
