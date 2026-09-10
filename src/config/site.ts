/**
 * Site-level constants. The one place that knows the brand lockup and the
 * shape of the navigation — the shell, the mobile menu and every page read
 * from here, so a new section is a single edit.
 */

export const site = {
  name: 'SHINIGAMAE.DEV',
  tagline: 'CREATE, PLAY, SLAY, ELATE',
  description:
    'A personal digital workshop and archive — things made, played, read, and shipped.',
  /** Rendered as the ↗ in the header. */
  external: {
    label: 'GitHub',
    href: 'https://github.com/shinigamae',
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
}

export const navigation: readonly NavEntry[] = [
  {
    label: 'HOME',
    href: '/',
    index: '01',
    context: 'HELLO',
    summary: 'Engineer by trade. The rest is to recreate.',
  },
  {
    label: 'WORKSHOP',
    href: '/workshop',
    index: '02',
    context: 'SECTION',
    summary: 'Systems I build, break, refactor, and occasionally ship.',
  },
  {
    label: 'BUILDS',
    href: '/builds',
    index: '03',
    context: 'SECTION',
    summary:
      'Nub marks, spilled panel liner, and a growing suspicion that Bandai is overrated.',
  },
  {
    label: 'GAMES',
    href: '/games',
    index: '04',
    context: 'SECTION',
    summary: '293 games, 98 platinums, and over 600 days I am not getting back.',
  },
  {
    label: 'BOOKS',
    href: '/books',
    index: '05',
    context: 'SECTION',
    summary: "135 books, 18 of them are Murakami's.",
  },
  {
    label: 'JOURNEYS',
    href: '/journeys',
    index: '06',
    context: 'SECTION',
    summary: 'Journeys through the world.',
  },
] as const;

/**
 * Header navigation omits HOME — the brand lockup is the home link, as in
 * the Figma header. HOME still exists in `navigation` for page metadata and
 * for the mobile menu, which lists every destination explicitly.
 */
export const headerNavigation = navigation.filter((entry) => entry.href !== '/');

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
