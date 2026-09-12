#!/usr/bin/env node
/**
 * spotify-sync — build the ON ROTATION snapshot from the Spotify Web API.
 *
 *   npm run music:sync            rewrite src/content/music/rotation.json
 *   npm run music:check           report what would change, write nothing
 *
 *   SPOTIFY_SOURCE=recent npm run music:sync    last played, not most played
 *   SPOTIFY_RANGE=long_term npm run music:sync  all time, not the last 4 weeks
 *   SPOTIFY_LIMIT=8 npm run music:sync          how many rows the chart holds
 *
 * Needs three values in .env (gitignored) or the environment:
 *
 *   SPOTIFY_CLIENT_ID
 *   SPOTIFY_CLIENT_SECRET
 *   SPOTIFY_REFRESH_TOKEN     ← from `npm run music:auth`, once
 *
 * ---------------------------------------------------------------------------
 * Two things this file deliberately does not do.
 *
 * It does not read a public playlist. That was the easier build — app-only
 * credentials, no consent screen — but a playlist is a thing you curate, and
 * the section claims to be a play count. /me/top/tracks is the only source
 * that can back that claim.
 *
 * It does not carry a preview URL. Spotify stopped returning `preview_url` to
 * apps registered after November 2024, so there is no 30-second clip to hand
 * a custom player even if one were wanted. Playback on the site is their
 * iframe embed, addressed by track id — see src/components/ui/Rotation.astro.
 * ---------------------------------------------------------------------------
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_FILE = path.join(ROOT, 'src/content/music/rotation.json');

const WRITE = !process.argv.includes('--check');

/** `top` = most played. `recent` = last played, de-duplicated. */
const SOURCE = process.env.SPOTIFY_SOURCE === 'recent' ? 'recent' : 'top';

/** Spotify's windows: short ≈ 4 weeks, medium ≈ 6 months, long ≈ years. */
const RANGE = process.env.SPOTIFY_RANGE ?? 'short_term';

/**
 * Twelve rows: one featured beside eleven, which fills the column next to the
 * art-and-player block without the page growing a scrollbar of its own.
 */
const LIMIT = Number(process.env.SPOTIFY_LIMIT ?? 12);

const VALID_RANGES = ['short_term', 'medium_term', 'long_term'];

/* ------------------------------------------------------------------ *
 * Credentials
 * ------------------------------------------------------------------ */

function credentials() {
  if (!process.env.SPOTIFY_REFRESH_TOKEN) {
    try {
      process.loadEnvFile(path.join(ROOT, '.env'));
    } catch {
      /* no .env — fall through to the error below */
    }
  }

  const id = process.env.SPOTIFY_CLIENT_ID;
  const secret = process.env.SPOTIFY_CLIENT_SECRET;
  const refresh = process.env.SPOTIFY_REFRESH_TOKEN;

  if (!id || !secret || !refresh) {
    const missing = [
      !id && 'SPOTIFY_CLIENT_ID',
      !secret && 'SPOTIFY_CLIENT_SECRET',
      !refresh && 'SPOTIFY_REFRESH_TOKEN',
    ].filter(Boolean);

    throw new Error(
      [
        `Missing ${missing.join(', ')}.`,
        '',
        '  The first two come from https://developer.spotify.com/dashboard.',
        '  The third comes from `npm run music:auth`, which you run once.',
        '  See the header of scripts/spotify-auth.mjs.',
      ].join('\n'),
    );
  }
  return { id, secret, refresh };
}

/**
 * Refresh tokens do not expire; access tokens last an hour. A sync is a
 * handful of seconds, so one exchange per run is all this needs.
 */
async function accessToken({ id, secret, refresh }) {
  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}`,
    },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refresh }),
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.access_token) {
    // 400 invalid_grant is the one worth naming: it means the grant was
    // revoked (password change, or "remove access" in the Spotify account
    // page), and the fix is to run music:auth again — not to retry.
    const hint =
      body.error === 'invalid_grant'
        ? '\n  The refresh token has been revoked. Run `npm run music:auth` again.'
        : '';
    throw new Error(
      `Could not refresh the Spotify token (${response.status}): ${body.error_description ?? body.error ?? 'unknown'}${hint}`,
    );
  }
  return body.access_token;
}

async function api(endpoint, token) {
  const response = await fetch(`https://api.spotify.com/v1/${endpoint}`, {
    headers: { authorization: `Bearer ${token}` },
  });

  if (response.status === 429) {
    const after = response.headers.get('retry-after') ?? '?';
    throw new Error(`Rate limited by Spotify — retry after ${after}s.`);
  }
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(
      `GET /v1/${endpoint} failed (${response.status}): ${body.error?.message ?? 'unknown'}`,
    );
  }
  return response.json();
}

/* ------------------------------------------------------------------ *
 * Shaping
 * ------------------------------------------------------------------ */

/**
 * Album art comes in three sizes — 640, 300 and 64. The page paints the
 * feature plate at 340 CSS px and the row thumbnails at 32, so 300 is the one
 * that is neither upscaled on the plate nor a 640px file behind a 32px
 * square. Fall back to whatever is last (smallest) if the shape changes.
 */
function artOf(album) {
  const images = album?.images ?? [];
  if (images.length === 0) return undefined;
  const medium = images.find((image) => image.width && image.width <= 400 && image.width >= 200);
  return (medium ?? images[images.length - 1]).url;
}

/** "2019-03-15" | "2019-03" | "2019" — Spotify varies by release precision. */
function yearOf(album) {
  const year = Number(String(album?.release_date ?? '').slice(0, 4));
  return Number.isInteger(year) && year > 1900 ? year : undefined;
}

function shape(track, rank, playedAt) {
  return {
    id: track.id,
    title: track.name,
    artists: (track.artists ?? []).map((artist) => artist.name).filter(Boolean),
    album: track.album?.name ?? '',
    art: artOf(track.album),
    releaseYear: yearOf(track.album),
    durationMs: track.duration_ms,
    url: track.external_urls?.spotify ?? `https://open.spotify.com/track/${track.id}`,
    rank,
    ...(playedAt ? { playedAt } : {}),
  };
}

/** Drops undefined so the committed JSON has no null-shaped holes in it. */
const compact = (value) =>
  Array.isArray(value)
    ? value.map(compact)
    : value && typeof value === 'object'
      ? Object.fromEntries(
          Object.entries(value)
            .filter(([, v]) => v !== undefined)
            .map(([k, v]) => [k, compact(v)]),
        )
      : value;

/* ------------------------------------------------------------------ *
 * Main
 * ------------------------------------------------------------------ */

async function main() {
  if (!VALID_RANGES.includes(RANGE)) {
    throw new Error(`SPOTIFY_RANGE must be one of ${VALID_RANGES.join(', ')} — got "${RANGE}".`);
  }

  const token = await accessToken(credentials());

  let tracks;
  if (SOURCE === 'recent') {
    // Spotify returns plays, not tracks: a song heard three times is three
    // items. Ranked by most recent play, first occurrence wins.
    const body = await api('me/player/recently-played?limit=50', token);
    const seen = new Map();
    for (const item of body.items ?? []) {
      if (item.track?.id && !seen.has(item.track.id)) seen.set(item.track.id, item);
    }
    tracks = [...seen.values()]
      .slice(0, LIMIT)
      .map((item, i) => shape(item.track, i + 1, item.played_at));
  } else {
    const body = await api(`me/top/tracks?time_range=${RANGE}&limit=${LIMIT}`, token);
    tracks = (body.items ?? []).filter((item) => item?.id).map((item, i) => shape(item, i + 1));
  }

  // The same refusal every other sync makes: an empty answer is a failure,
  // not a chart with nothing in it. Overwriting a good file with [] would
  // silently delete the section from the homepage.
  if (tracks.length === 0) {
    throw new Error(
      SOURCE === 'recent'
        ? 'Spotify returned no recent plays. Nothing written.'
        : 'Spotify returned no top tracks — a new account, or a window with no listening in it. Nothing written.',
    );
  }

  const previous = JSON.parse(await fs.readFile(OUT_FILE, 'utf8').catch(() => '{}'));

  const data = compact({
    // Preserved rather than regenerated: it explains the file to whoever
    // opens it next, and it is the one thing here a sync should not own.
    $comment: previous.$comment,
    source: SOURCE,
    range: SOURCE === 'top' ? RANGE : undefined,
    syncedAt: new Date().toISOString(),
    tracks,
  });

  for (const track of tracks) {
    console.log(
      `${String(track.rank).padStart(2, '0')}  ${track.title} — ${track.artists.join(', ')}`,
    );
  }

  // Compared without the timestamp: it changes on every run, and a diff that
  // is always dirty makes the daily workflow commit noise for no new content.
  const same =
    JSON.stringify({ ...previous, syncedAt: null }) === JSON.stringify({ ...data, syncedAt: null });

  if (!same && WRITE) {
    await fs.mkdir(path.dirname(OUT_FILE), { recursive: true });
    await fs.writeFile(OUT_FILE, `${JSON.stringify(data, null, 2)}\n`);
  }

  console.log(
    `\n${tracks.length} tracks — ${SOURCE === 'recent' ? 'recently played' : `most played, ${RANGE}`}.\n` +
      (same
        ? 'No change — the chart matches the site.'
        : WRITE
          ? `Written to ${path.relative(ROOT, OUT_FILE)}.`
          : '--check: nothing written.'),
  );
}

try {
  await main();
} catch (error) {
  console.error(`\n${error.message}\n`);
  process.exitCode = 1;
}
