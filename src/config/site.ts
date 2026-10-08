/**
 * Site-level constants. The one place that knows the brand lockup and the
 * shape of the navigation — the shell, the mobile menu and every page read
 * from here, so a new section is a single edit.
 */

export const site = {
  /**
   * The name, with no TLD on it. It read SHINIGAMAE.DEV for a while, which
   * committed the site in its own header to a domain that is not registered
   * yet — .dev and .com are both still open questions. A name survives that
   * decision; a wordmark with a TLD baked in has to be re-cut afterwards.
   */
  name: 'SHINIGAMAE',
  tagline: 'CREATE, PLAY, SLAY, ELATE',
  /** The professional line — the home page's title and its first heading. */
  role: 'Technical Project Manager & Software Engineer',
  description:
    'Technical Project Manager and software engineer focused on technical delivery, engineering leadership, software architecture, and building things worth keeping.',
  /** Rendered as the ↗ in the header. */
  external: {
    label: 'GitHub',
    href: 'https://github.com/shinigamae',
  },
  /**
   * Where to reach me about work — the Workshop's closing section and the
   * footer both point here. LinkedIn rather than an email address: it is
   * where work conversations already happen, and it keeps an address off a
   * page that anything can scrape.
   */
  contact: {
    label: 'LinkedIn',
    href: 'https://www.linkedin.com/in/ntkhanh/',
  },
} as const;

export interface NavEntry {
  /** Mono uppercase label, as it appears in the design. */
  label: string;
  href: string;
  /** Two-digit index used by the page eyebrow: "01 / HELLO". */
  index: string;
  /** Eyebrow context word, paired with the index. */
  context: string;
  /** One-line description, shown under the page title. */
  summary: string;
  /**
   * The section's colour, as the key half of `--color-word-<accent>` in
   * tokens.css. It is the same key the homepage hero ties a word to its card
   * by — CODE. opens /workshop, so /workshop's tab in the header lights in
   * CODE's amber-or-cyan and not in the one accent every nav used to take.
   *
   * Four of the five are the hero's own words. JOURNEYS has no word in the
   * stack — the hero is four lines — so it carries a fifth pair of its own
   * rather than falling back to the cyan and reading as a second WORKSHOP.
   */
  accent: string;
  /**
   * The header group this page sits under, by the group's href. The four
   * archives and NOW belong to LIFESTYLE: the header shows the group, and the
   * page itself is reached from its menu.
   */
  group?: string;
}

export const navigation: readonly NavEntry[] = [
  {
    label: 'HOME',
    href: '/',
    index: '01',
    context: 'HELLO',
    summary: 'I lead software teams, design systems, and still build things.',
    accent: 'code',
  },
  {
    label: 'WORKSHOP',
    href: '/workshop',
    index: '02',
    context: 'WORK',
    summary: 'Systems I design, build, lead, and ship — and what each one taught me.',
    accent: 'code',
  },
  {
    label: 'LIFESTYLE',
    href: '/lifestyle',
    index: '03',
    context: 'SECTION',
    summary: 'The things I build, play, read, collect, explore, and obsess over.',
    accent: 'life',
  },
  {
    label: 'BUILDS',
    href: '/builds',
    index: '03',
    context: 'LIFESTYLE',
    summary:
      'Nub marks, spilled panel liner, and a growing suspicion that Bandai is overrated.',
    accent: 'build',
    group: '/lifestyle',
  },
  {
    label: 'GAMES',
    href: '/games',
    index: '03',
    context: 'LIFESTYLE',
    summary: '293 games, 98 platinums, and over 600 days I am not getting back.',
    accent: 'play',
    group: '/lifestyle',
  },
  {
    label: 'BOOKS',
    href: '/books',
    index: '03',
    context: 'LIFESTYLE',
    summary: "135 books, 18 of them are Murakami's.",
    accent: 'read',
    group: '/lifestyle',
  },
  {
    label: 'JOURNEYS',
    href: '/journeys',
    index: '03',
    context: 'LIFESTYLE',
    summary: 'Journeys through the world.',
    accent: 'journeys',
    group: '/lifestyle',
  },
  {
    label: 'NOW',
    href: '/now',
    index: '03',
    context: 'LIFESTYLE',
    summary: 'What is on the desk, the shelf and the speakers this week.',
    accent: 'life',
    group: '/lifestyle',
  },
  {
    label: 'ABOUT',
    href: '/about',
    index: '04',
    context: 'SECTION',
    summary: 'Why I think and build this way.',
    accent: 'code',
  },
  {
    label: 'RESUME',
    href: '/resume',
    index: '05',
    context: 'RECORD',
    summary:
      'Technical project manager and .NET engineer — teams, offshore centres and systems shipped.',
    accent: 'code',
  },
] as const;

/**
 * The header: four destinations and the resume, per the redesign spec. WORK
 * is the label a recruiter scans for; the page it opens still calls itself
 * the Workshop. LIFESTYLE carries its pages as a menu, so a reader can go
 * straight to the games without passing the hub.
 */
export interface NavGroup {
  label: string;
  href: string;
  accent?: string;
  children: readonly NavEntry[];
}

const groupOf = (label: string, href: string, accent?: string): NavGroup => ({
  label,
  href,
  accent,
  children: navigation.filter((entry) => entry.group === href),
});

export const headerNavigation: readonly NavGroup[] = [
  groupOf('WORK', '/workshop', 'code'),
  groupOf('LIFESTYLE', '/lifestyle', 'life'),
  groupOf('ABOUT', '/about', 'code'),
  groupOf('RESUME', '/resume', 'code'),
];

/*
 * Base-path handling.
 *
 * The site is served from a subpath (https://shinigamae.github.io/air-chrysalis/),
 * and Astro does not rewrite root-absolute links. So every internal href goes
 * through `withBase`, and every path being *matched* goes through `stripBase`
 * first, because `Astro.url.pathname` includes the base while our route
 * constants do not.
 *
 * Both are no-ops when `base` is unset, so moving to a custom domain later
 * means deleting one config line and nothing else.
 */

/** '' when there is no base, otherwise '/air-chrysalis' (no trailing slash). */
const BASE = import.meta.env.BASE_URL.replace(/\/+$/, '');

/**
 * Prefix an internal, root-relative path with the base.
 *
 * Absolute and scheme-relative URLs pass through untouched. Build photos are
 * hotlinked from the Blogspot CDN, so image props are a mix of local paths and
 * remote URLs, and every caller would otherwise have to test which it holds.
 */
export function withBase(path: string): string {
  if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(path)) return path;
  const rooted = path.startsWith('/') ? path : `/${path}`;
  return `${BASE}${rooted}`;
}

/**
 * Remove the base from a real request path, yielding a logical route.
 * Idempotent, and only strips on a true segment boundary so a route that
 * merely starts with the base string is left alone.
 */
export function stripBase(pathname: string): string {
  if (!BASE || !pathname.startsWith(BASE)) return pathname;
  const rest = pathname.slice(BASE.length);
  if (rest !== '' && !rest.startsWith('/')) return pathname;
  return rest === '' ? '/' : rest;
}

/**
 * True for the section itself and for any nested detail route beneath it.
 * Expects a logical path — run `stripBase` on request paths first.
 */
export function isActive(pathname: string, href: string): boolean {
  const path = pathname.replace(/\/+$/, '') || '/';
  if (href === '/') return path === '/';
  return path === href || path.startsWith(`${href}/`);
}

/**
 * The nav entry a pathname belongs to, used for page + top bar metadata.
 * Accepts either a real request path or a logical one — it strips the base
 * itself, because pages pass `Astro.url.pathname` straight in.
 */
export function entryFor(pathname: string): NavEntry | undefined {
  const path = stripBase(pathname);
  return navigation.find((entry) => isActive(path, entry.href));
}

/** A group is lit on its own page and on any page filed under it. */
export function isGroupActive(pathname: string, group: NavGroup): boolean {
  return (
    isActive(pathname, group.href) ||
    group.children.some((child) => isActive(pathname, child.href))
  );
}
