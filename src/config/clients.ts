import type { CollectionEntry } from 'astro:content';

/**
 * Shared vocabulary for the Workshop's client list.
 *
 * Everything here is derived from the roles, because the roles are the only
 * thing anyone will keep up to date. A `current` flag or a hand-set order
 * would be a second copy of the same fact, free to drift from it.
 */

export type Client = CollectionEntry<'clients'>;
export type Role = Client['data']['roles'][number];

/** Still there — the newest role has no end date. */
export const clientIsCurrent = (client: Client) =>
  client.data.roles.some((role) => role.to === undefined);

/**
 * Sort key: when the engagement last ran. An open role sorts as "now", which
 * is what puts current clients at the top without a separate flag.
 */
const lastActive = (client: Client) =>
  client.data.roles.reduce(
    (latest, role) => (role.to === undefined ? '9999' : role.to > latest ? role.to : latest),
    '',
  );

/** Most recent first, current clients first of all. */
export const byRecency = (a: Client, b: Client) =>
  lastActive(b).localeCompare(lastActive(a));

/*
 * There is no formatter for the dates, and that is deliberate. The cards
 * print titles, not periods: the engagements overlapped, and two cards whose
 * years can be laid side by side invite a reading of how the time was split
 * that the page is not making. The dates stay in the data because the order
 * below is built from them — they sort the list, they do not appear in it.
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
