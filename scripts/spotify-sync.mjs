#!/usr/bin/env node
/**
 * spotify-sync — build the ON ROTATION snapshot from the Spotify Web API.
 *
 *   npm run music:sync            rewrite src/content/music/rotation.json
 *   npm run music:check           report what would change, write nothing
 *
 *   SPOTIFY_LIMIT=6 npm run music:sync     how many playlists the section holds
 *   SPOTIFY_TRACKS=20 npm run music:sync   how many tracks each one lists
 *
 * Needs three values in .env (gitignored) or the environment:
 *
 *   SPOTIFY_CLIENT_ID
 *   SPOTIFY_CLIENT_SECRET
 *   SPOTIFY_REFRESH_TOKEN     ← from `npm run music:auth`, once
 *
 * ---------------------------------------------------------------------------
 * What this is, and what it replaced.
 *
 * It was a play-count chart: /me/top/tracks, twelve rows, ranked. That claim —
 * "this is what I actually listened to" — is what made it need an exclusion
 * list, because music played for someone else on the account is still
 * listening and Spotify counts it. A bedtime playlist on repeat ranked above
 * everything, playlist privacy hides the playlist and not the plays, and the
 * fix was a denylist of track ids maintained by hand.
 *
 * This is a list of *public playlists you own, most recently played first*, and the
 * exclusion list is gone with it: a playlist is curated by existing, so the
 * curation happens in Spotify rather than in a JSON file or an admin screen.
 * Spotify's own playlists — Discover Weekly, the daylists, anything under the
 * `37i9dQZF1…` prefix — are filtered out, because they are not a thing you
 * chose. Private ones are filtered out too, and not on the flag alone: listing
 * a playlist promises a reader the link works for them, so that is asked
 * literally, with credentials that know nothing about you.
 *
 * Three things worth knowing about the API this rests on.
 *
 * `/me/player/recently-played` is the only endpoint that knows a playlist was
 * *played*. Each item carries a `context`, and for a playlist that context is
 * its URI. There is no "recently played playlists" endpoint; this derives it.
 *
 * It reaches about 50 plays per page and cannot go back further than a few
 * days, so this walks a few pages to find enough distinct playlists. A
 * playlist you have not played in a week will fall off, which is the point.
 *
 * The track list is under `items`, not `tracks`. `/playlists/{id}/tracks`
 * answers 403 and the documented `tracks.total` is missing from the playlist
 * response, which read for a while as "this app may not see track lists" —
 * it is not. Spotify renamed the relation: the collection is
 * `/playlists/{id}/items`, each entry holds `item` where the docs say
 * `track`, and both answer 200 with the same user token. So the shelf carries
 * its own track list and the count beside a playlist name is real.
 *
 * That list is *paged and long* — a playlist here runs past a hundred — so
 * only the first SPOTIFY_TRACKS of it are written. The count is the whole
 * thing, and the section says which of the two it is showing.
 *
 * App-only credentials are not enough. They return playlist *metadata* and no
 * track list, and they cannot see recently-played at all — that is user data.
 * So the refresh token stays. The scopes it already has are sufficient:
 * `user-read-recently-played` for the history, and nothing at all for reading
 * a public playlist, which any user token may do.
 * ---------------------------------------------------------------------------
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_FILE = path.join(ROOT, 'src/content/music/rotation.json');

const WRITE = !process.argv.includes('--check');

/**
 * Six playlists: enough to show a habit, few enough that the section stays a
 * shelf rather than a library.
 */
const LIMIT = Number(process.env.SPOTIFY_LIMIT ?? 6);

/**
 * How many tracks of each playlist are written out.
 *
 * Twenty is ten rows in each of the section's two columns. The playlists here
 * run to a hundred tracks and more, and the whole of one would be a page of
 * its own — this is a shelf, so it shows a spine's worth and says how much
 * more there is.
 */
const TRACK_LIMIT = Number(process.env.SPOTIFY_TRACKS ?? 20);

/** How many pages of history to walk looking for distinct playlists. */
const PAGES = 3;

/**
 * Spotify's own playlists all sit under this prefix — Discover Weekly, Release
 * Radar, the daylists, every editorial mix. They are recommendations, not
 * choices, and this section is about what you chose.
 */
const SPOTIFY_OWNED_PREFIX = '37i9dQZF1';

/* ------------------------------------------------------------------ *
 * Credentials
 * ------------------------------------------------------------------ */

function credentials() {
  // Same as psn-sync and spotify-auth: the environment wins, and .env is the
  // fallback for a local run. In Actions there is no .env and the secrets are
  // already in the environment, so this throws and is ignored.
  if (!process.env.SPOTIFY_REFRESH_TOKEN) {
    try {
      process.loadEnvFile(path.join(ROOT, '.env'));
    } catch {
      /* no .env — fall through to the missing-credentials report below */
    }
  }

  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  const refreshToken = process.env.SPOTIFY_REFRESH_TOKEN;

  const missing = [
    !clientId && 'SPOTIFY_CLIENT_ID',
    !clientSecret && 'SPOTIFY_CLIENT_SECRET',
    !refreshToken && 'SPOTIFY_REFRESH_TOKEN',
  ].filter(Boolean);

  if (missing.length > 0) {
    // Loudly, not silently. A sync that writes an empty chart because a secret
    // went missing looks exactly like a sync that ran and found nothing.
    console.error(`spotify-sync: missing ${missing.join(', ')}.`);
    console.error('See README.md — "On rotation comes from Spotify".');
    process.exit(1);
  }

  return { clientId, clientSecret, refreshToken };
}

async function token({ clientId, clientSecret }, grant) {
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(grant),
  });

  const body = await response.json();
  if (!response.ok || !body.access_token) {
    console.error(`spotify-sync: token exchange failed (${response.status}).`);
    if (body.error === 'invalid_grant') {
      console.error('The refresh token was revoked. Run `npm run music:auth` for a new one.');
    } else if (body.error_description) {
      console.error(body.error_description);
    }
    process.exit(1);
  }

  return body.access_token;
}

/** The user token: the play history, and playlists as their owner sees them. */
const userToken = (creds) =>
  token(creds, { grant_type: 'refresh_token', refresh_token: creds.refreshToken });

/**
 * An app-only token, used for exactly one thing: asking whether a stranger can
 * open a playlist. See `isPubliclyVisible`.
 */
const anonToken = (creds) => token(creds, { grant_type: 'client_credentials' });

/* ------------------------------------------------------------------ *
 * Reading
 * ------------------------------------------------------------------ */

async function api(pathname, token) {
  const response = await fetch(`https://api.spotify.com/v1${pathname}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    console.error(`spotify-sync: GET ${pathname} -> ${response.status}`);
    process.exit(1);
  }

  return response.json();
}

/** The signed-in user's own id, which is what "my playlist" is decided against. */
async function me(token) {
  const profile = await api('/me', token);
  return profile.id;
}

/**
 * Distinct playlist ids from the play history, most recently played first.
 *
 * Walks back through pages with the `before` cursor until it has enough, or
 * runs out of history. Spotify keys that cursor on a millisecond timestamp,
 * hence the `- 1`: passing the same timestamp back returns the same page for
 * ever, which is a loop rather than an error.
 */
async function recentlyPlayedPlaylists(token) {
  const seen = new Map();
  let before = null;

  for (let page = 0; page < PAGES; page++) {
    const query = new URLSearchParams({ limit: '50' });
    if (before) query.set('before', String(before));

    const history = await api(`/me/player/recently-played?${query}`, token);
    const items = history.items ?? [];
    if (items.length === 0) break;

    for (const item of items) {
      const uri = item.context?.uri ?? '';
      if (!uri.startsWith('spotify:playlist:')) continue;

      const id = uri.slice('spotify:playlist:'.length);
      if (id.startsWith(SPOTIFY_OWNED_PREFIX)) continue;
      if (!seen.has(id)) seen.set(id, item.played_at);
    }

    const oldest = items[items.length - 1]?.played_at;
    if (!oldest) break;
    before = Date.parse(oldest) - 1;
  }

  return [...seen.entries()].map(([id, playedAt]) => ({ id, playedAt }));
}

/**
 * Whether a visitor who is not signed in as you can actually open this.
 *
 * `public: false` is the flag to trust and this checks it first, but it is not
 * what is being claimed. The claim the site makes by listing a playlist is that
 * the link works for the person reading it — so this asks that question
 * literally, with credentials that know nothing about you, and believes the
 * answer over the flag.
 *
 * Spotify's "private" does not mean unreachable, and its `public` field can come
 * back null when the status is not known; both are reasons a flag alone is the
 * wrong thing to publish someone's listening on. A failure here is read as "not
 * visible", so the safe direction is the default one.
 */
async function isPubliclyVisible(id, anon) {
  try {
    const response = await fetch(`https://api.spotify.com/v1/playlists/${id}?fields=id`, {
      headers: { Authorization: `Bearer ${anon}` },
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * The projection asked of `/playlists/{id}/items`.
 *
 * Spelled out rather than taking the whole object: the unfiltered entry is
 * about 2KB of available-markets arrays and href fields per track, and this
 * file is committed. `item` is where the docs say `track` — see the header.
 */
const TRACK_FIELDS =
  'total,items(is_local,item(name,type,duration_ms,external_urls(spotify),artists(name),album(name)))';

/**
 * The first TRACK_LIMIT tracks of a playlist, and how many there are in all.
 *
 * A failure here is not fatal. The playlist is still worth listing with its
 * cover and its link — the section falls back to Spotify's own embed for the
 * contents — so this answers with an empty list and a null count rather than
 * taking the whole sync down with it.
 *
 * Local files and podcast episodes are dropped: a local file is a path on one
 * machine and cannot be linked, and an episode in a music shelf is noise.
 */
async function tracksOf(id, token) {
  const query = new URLSearchParams({ limit: String(TRACK_LIMIT), fields: TRACK_FIELDS });
  const response = await fetch(`https://api.spotify.com/v1/playlists/${id}/items?${query}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    console.warn(`spotify-sync: no track list for ${id} (${response.status}) — listing it anyway`);
    return { tracks: [], trackCount: null };
  }

  const data = await response.json();
  const tracks = (data.items ?? [])
    .filter((entry) => !entry.is_local && entry.item?.type === 'track' && entry.item.name)
    .map((entry) => ({
      name: entry.item.name,
      // Spotify lists every credited artist; the shelf shows them joined, and
      // joining here would throw away the ability to change that later.
      artists: (entry.item.artists ?? []).map((artist) => artist.name).filter(Boolean),
      album: entry.item.album?.name ?? '',
      durationMs: entry.item.duration_ms ?? 0,
      url: entry.item.external_urls?.spotify,
    }));

  return { tracks, trackCount: typeof data.total === 'number' ? data.total : null };
}

/**
 * One playlist, as the site renders it. Returns null for anything that is not
 * yours, and for anything that has gone — a playlist deleted since it was
 * played answers 404, which is ordinary rather than fatal.
 */
async function playlist(id, playedAt, user, anon, owner) {
  const response = await fetch(`https://api.spotify.com/v1/playlists/${id}`, {
    headers: { Authorization: `Bearer ${user}` },
  });

  if (!response.ok) return null;
  const data = await response.json();
  if (data.owner?.id !== owner) return null;

  // Both, not either. The flag is cheap and catches the ordinary case; the
  // anonymous fetch is what the site is actually promising a reader.
  if (data.public !== true) return null;
  if (!(await isPubliclyVisible(id, anon))) return null;

  const { tracks, trackCount } = await tracksOf(id, user);

  return {
    id: data.id,
    name: data.name ?? '',
    // Spotify fills this with its own boilerplate for generated playlists and
    // leaves it empty for most hand-made ones, so it is optional everywhere.
    description: stripTags(data.description ?? ''),
    url: data.external_urls?.spotify ?? `https://open.spotify.com/playlist/${data.id}`,
    // Largest first in Spotify's ordering; the section renders it at card size.
    image: data.images?.[0]?.url,
    playedAt,
    /** How many tracks in all — not how many are listed below. */
    ...(trackCount === null ? {} : { trackCount }),
    tracks,
  };
}

/** Playlist descriptions arrive as HTML. The site renders text, so this is text. */
function stripTags(html) {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
}

/* ------------------------------------------------------------------ *
 * Writing
 * ------------------------------------------------------------------ */

/** The `$comment` block is the one thing in this file a human owns. */
async function existingComment() {
  try {
    const current = JSON.parse(await fs.readFile(OUT_FILE, 'utf8'));
    return current.$comment;
  } catch {
    return undefined;
  }
}

async function main() {
  const creds = credentials();
  const user = await userToken(creds);
  const anon = await anonToken(creds);
  const owner = await me(user);

  const recent = await recentlyPlayedPlaylists(user);
  const resolved = [];

  for (const { id, playedAt } of recent) {
    if (resolved.length >= LIMIT) break;
    const entry = await playlist(id, playedAt, user, anon, owner);
    if (entry) resolved.push(entry);
  }

  const $comment = await existingComment();
  const next = {
    ...($comment ? { $comment } : {}),
    syncedAt: new Date().toISOString(),
    playlists: resolved,
  };

  if (!WRITE) {
    console.log(`spotify-sync --check: ${resolved.length} public playlist(s) of your own`);
    for (const entry of resolved) {
      const listed = entry.tracks.length;
      const total = entry.trackCount ?? '?';
      console.log(
        `  ${entry.playedAt.slice(0, 16).replace('T', ' ')}  ${entry.name}` +
          `  (${listed} of ${total} track(s))`,
      );
    }
    if (resolved.length === 0) {
      console.log('  Nothing. Play one of your own *public* playlists and run this again.');
    }
    return;
  }

  await fs.writeFile(OUT_FILE, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  console.log(`spotify-sync: wrote ${resolved.length} playlist(s) to ${path.relative(ROOT, OUT_FILE)}`);
}

await main();
