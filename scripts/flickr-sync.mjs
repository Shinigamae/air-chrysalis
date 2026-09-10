#!/usr/bin/env node
/**
 * flickr-sync — build the JOURNEYS content collection from Flickr albums.
 *
 *   npm run albums:sync           rewrite src/content/albums/*.json
 *   npm run albums:check          report what would change, write nothing
 *
 *   FLICKR_USER=someone npm run albums:check    read a different photostream
 *
 * Not scraped from flickr.com. Their robots.txt ends with
 * `User-agent: * / Disallow: /` — a named allowlist of about forty crawlers,
 * and a closed door for everything else. The public API is the sanctioned way
 * in, and it is better data besides: real sizes, real dates, real album
 * structure instead of parsed markup.
 *
 * Only public photos are read, so an api_key is enough — no OAuth signing.
 * The key is free, instant, and unlike the PSN token it does not expire.
 *
 * Images are hotlinked from live.staticflickr.com, which serves them for
 * exactly this and whose robots.txt says "# Nothing to see here".
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(ROOT, 'src/content/albums');
const OVERRIDES = path.join(ROOT, 'src/content/albums-overrides.json');

const USER = process.env.FLICKR_USER ?? 'shinigamae';
const ENDPOINT = 'https://api.flickr.com/services/rest/';

/** Flickr's ceiling for both photosets.getList and photosets.getPhotos. */
const PER_PAGE = 500;

const WRITE = !process.argv.includes('--check');

/**
 * Sizes requested for every photo.
 *
 * `m` (500px) feeds the filmstrip, `l` (1024px) the album page. Asking for
 * both up front means the JSON carries real dimensions, so every image can
 * reserve its aspect ratio and the grid does not jump as photos arrive.
 */
const EXTRAS = 'url_m,url_l,date_taken,description';

/* ------------------------------------------------------------------ *
 * Credential
 * ------------------------------------------------------------------ */

class KeyError extends Error {}
class UnreachableError extends Error {}

function readKey() {
  if (!process.env.FLICKR_API_KEY) {
    try {
      process.loadEnvFile(path.join(ROOT, '.env'));
    } catch {
      /* no .env — fall through to the error below */
    }
  }
  const key = process.env.FLICKR_API_KEY;
  if (!key) {
    throw new KeyError(
      [
        'FLICKR_API_KEY is not set.',
        '  Apply for a non-commercial key (instant, free, does not expire):',
        '    https://www.flickr.com/services/apps/create/apply/',
        '  Then put FLICKR_API_KEY=... in .env (already gitignored), or set',
        '  the FLICKR_API_KEY secret for GitHub Actions.',
      ].join('\n'),
    );
  }
  return key.trim();
}

/* ------------------------------------------------------------------ *
 * API
 * ------------------------------------------------------------------ */

let API_KEY;

async function call(method, params = {}, attempts = 4) {
  const url = new URL(ENDPOINT);
  url.search = new URLSearchParams({
    method,
    api_key: API_KEY,
    format: 'json',
    nojsoncallback: '1',
    ...params,
  }).toString();

  for (let attempt = 1; ; attempt++) {
    let body;
    try {
      const response = await fetch(url);
      body = await response.text();
    } catch (error) {
      if (attempt >= attempts) {
        throw new UnreachableError(
          [
            'Could not reach api.flickr.com — the connection failed before',
            '  Flickr answered, so the key was never judged.',
            '  If this network blocks it, run the sync from GitHub Actions:',
            '    gh workflow run content-sync.yml',
            `  (underlying error: ${error.cause?.code ?? error.message})`,
          ].join('\n'),
        );
      }
      await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** (attempt - 1)));
      continue;
    }

    let json;
    try {
      json = JSON.parse(body);
    } catch {
      throw new UnreachableError(
        [
          'Flickr answered with something other than JSON, so the request did',
          '  not reach the API — a proxy or block page, most likely.',
          `  (first bytes: ${JSON.stringify(body.slice(0, 80))})`,
        ].join('\n'),
      );
    }

    if (json.stat === 'ok') return json;

    // 100 is "invalid key", 98/99 are auth — none of which a retry fixes.
    if ([98, 99, 100].includes(json.code)) {
      throw new KeyError(
        [
          `Flickr rejected the API key: ${json.message}`,
          '  Check FLICKR_API_KEY in .env, and the FLICKR_API_KEY secret in',
          '  GitHub. Keys are free and do not expire:',
          '    https://www.flickr.com/services/apps/create/apply/',
        ].join('\n'),
      );
    }
    throw new Error(`${method} failed: ${json.code} ${json.message}`);
  }
}

/** Walk a paginated method until every page is in. */
async function pageThrough(method, params, pick) {
  const all = [];
  for (let page = 1; ; page++) {
    const json = await call(method, { ...params, per_page: String(PER_PAGE), page: String(page) });
    const container = pick(json);
    const items = container.items ?? [];
    all.push(...items);
    if (page >= Number(container.pages ?? 1) || items.length === 0) return all;
  }
}

/* ------------------------------------------------------------------ *
 * Shaping
 * ------------------------------------------------------------------ */

function slugify(text) {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 72);
}

const text = (value) => (typeof value === 'object' ? (value?._content ?? '') : (value ?? '')).trim();

/** "2024-03-11 14:02:55" -> "2024-03-11". Flickr's date_taken is local. */
const takenDate = (value) => (value ? String(value).slice(0, 10) : null);

/** Unix seconds -> ISO date. */
const unixDate = (value) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? new Date(n * 1000).toISOString().slice(0, 10) : null;
};

function toPhoto(photo) {
  const thumb = photo.url_m ?? photo.url_l ?? null;
  const large = photo.url_l ?? photo.url_m ?? null;
  if (!thumb || !large) return null;
  return {
    id: photo.id,
    title: text(photo.title),
    caption: text(photo.description),
    thumb,
    thumbWidth: Number(photo.width_m ?? photo.width_l) || null,
    thumbHeight: Number(photo.height_m ?? photo.height_l) || null,
    large,
    largeWidth: Number(photo.width_l ?? photo.width_m) || null,
    largeHeight: Number(photo.height_l ?? photo.height_m) || null,
    takenOn: takenDate(photo.datetaken),
  };
}

/* ------------------------------------------------------------------ *
 * Main
 * ------------------------------------------------------------------ */

async function readOverrides() {
  try {
    return JSON.parse(await fs.readFile(OVERRIDES, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return {};
    throw error;
  }
}

const compact = (data) =>
  Object.fromEntries(
    Object.entries(data).filter(([, v]) => {
      if (v === undefined || v === null || v === '') return false;
      if (Array.isArray(v) && v.length === 0) return false;
      return true;
    }),
  );

async function main() {
  API_KEY = readKey();

  // The username in a profile URL is not the NSID the API wants.
  const lookup = await call('flickr.urls.lookupUser', {
    url: `https://www.flickr.com/photos/${USER}/`,
  });
  const nsid = lookup.user.id;
  console.log(`${USER} -> ${nsid}`);

  const sets = await pageThrough(
    'flickr.photosets.getList',
    { user_id: nsid, primary_photo_extras: EXTRAS },
    (json) => ({ items: json.photosets.photoset ?? [], pages: json.photosets.pages }),
  );

  if (sets.length === 0) {
    throw new Error('Flickr returned no albums — refusing to empty the collection.');
  }

  // Oldest album is 01, so an existing one keeps its ordinal when a new album
  // is created. Ordinals are shown on the page.
  sets.sort((a, b) => Number(a.date_create) - Number(b.date_create));

  const overrides = await readOverrides();
  const entries = new Map();

  for (const [i, set] of sets.entries()) {
    const title = text(set.title) || `Album ${set.id}`;
    const photos = (
      await pageThrough(
        'flickr.photosets.getPhotos',
        { photoset_id: set.id, user_id: nsid, extras: EXTRAS, media: 'photos' },
        (json) => ({ items: json.photoset.photo ?? [], pages: json.photoset.pages }),
      )
    )
      .map(toPhoto)
      .filter(Boolean);

    if (photos.length === 0) {
      console.log(`skip    ${slugify(title)} (no photos with usable sizes)`);
      continue;
    }

    const dates = photos.map((p) => p.takenOn).filter(Boolean).sort();
    let slug = slugify(title) || `album-${set.id}`;
    if (entries.has(slug)) slug = `${slug}-${set.id}`;

    const data = {
      title: title.toUpperCase(),
      description: text(set.description),
      index: i + 1,
      flickrId: set.id,
      flickrUrl: `https://www.flickr.com/photos/${nsid}/albums/${set.id}`,
      photoCount: photos.length,
      // The primary photo is the cover Flickr shows; fall back to the first.
      cover: set.primary_photo_extras?.url_l ?? set.primary_photo_extras?.url_m ?? photos[0].large,
      takenFrom: dates[0] ?? null,
      takenTo: dates.at(-1) ?? null,
      createdOn: unixDate(set.date_create),
      photos,
    };

    Object.assign(data, overrides[slug] ?? {});
    entries.set(slug, data);
    console.log(`album   ${slug} (${photos.length} photos)`);
  }

  const existing = (await fs.readdir(OUT_DIR).catch(() => [])).filter((f) => f.endsWith('.json'));
  const wanted = new Set([...entries.keys()].map((s) => `${s}.json`));
  const stale = existing.filter((f) => !wanted.has(f));

  await fs.mkdir(OUT_DIR, { recursive: true });

  let written = 0;
  for (const [slug, data] of entries) {
    const file = path.join(OUT_DIR, `${slug}.json`);
    const next = `${JSON.stringify(compact(data), null, 2)}\n`;
    const prev = await fs.readFile(file, 'utf8').catch(() => null);
    if (prev === next) continue;
    written++;
    if (WRITE) await fs.writeFile(file, next);
  }
  for (const file of stale) {
    console.log(`remove  ${file.replace(/\.json$/, '')}`);
    if (WRITE) await fs.unlink(path.join(OUT_DIR, file));
  }

  const total = [...entries.values()].reduce((sum, a) => sum + a.photoCount, 0);
  console.log(
    `\n${entries.size} albums, ${total} photos — ${written} written, ${stale.length} removed` +
      (WRITE ? '' : ' (--check: nothing written)'),
  );
}

try {
  await main();
} catch (error) {
  if (error instanceof KeyError || error instanceof UnreachableError) {
    console.error(`\n${error.message}\n`);
    process.exitCode = 1;
  } else {
    throw error;
  }
}
