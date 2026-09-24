import type { CollectionEntry } from 'astro:content';

/**
 * Shared vocabulary for the Workshop's client list.
 *
 * Everything here is derived from the roles, because the roles are the only
 * thing anyone will keep up to date.
 */

export type Client = CollectionEntry<'clients'>;
export type Role = Client['data']['roles'][number];

/*
 * Nothing here says which engagement is still running, on purpose. A
 * "CURRENT" label, or a list sorted current-first, tells every client reading
 * the page which account has my attention today — and that is not the page's
 * business. The `to` dates stay in the data for the CV; nothing renders or
 * sorts by them.
 */

/** By name — the one order that carries no reading of who is current. */
export const byName = (a: Client, b: Client) =>
  a.data.name.localeCompare(b.data.name);

/*
 * There is no formatter for the dates, and that is deliberate. The cards
 * print titles, not periods: the engagements overlapped, and two cards whose
 * years can be laid side by side invite a reading of how the time was split
 * that the page is not making.
 */

/**
 * 'https://northwind-freight.example/work' -> 'northwind-freight.example'.
 * The card shows the host, not the URL: a bare domain is the recognisable
 * part and it fits the mono line without truncating.
 */
export function hostOf(href: string | undefined) {
  if (!href) return '';
  try {
    return new URL(href).host.replace(/^www\./, '');
  } catch {
    return href;
  }
}
