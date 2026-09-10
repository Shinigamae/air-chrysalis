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

/** '2022' + '2024' -> '2022 — 2024'; an open role reads 'PRESENT'. */
export const periodOf = (role: Role) => `${role.from} — ${role.to ?? 'PRESENT'}`;

/** The whole engagement, oldest start to newest end. */
export function spanOf(client: Client) {
  const starts = client.data.roles.map((role) => role.from).sort();
  const open = clientIsCurrent(client);
  const ends = client.data.roles
    .map((role) => role.to)
    .filter((to): to is string => to !== undefined)
    .sort();
  const end = open ? 'PRESENT' : (ends.at(-1) ?? starts[0]);
  return starts[0] === end ? starts[0] : `${starts[0]} — ${end}`;
}

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
