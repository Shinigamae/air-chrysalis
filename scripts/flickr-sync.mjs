#!/usr/bin/env node
/**
 * flickr-sync — build the JOURNEYS collection from public Flickr albums.
 *
 *   npm run albums:sync           rewrite src/content/albums/*.json
 *   npm run albums:check          report what would change, write nothing
 *
 *   FLICKR_USER=someone npm run albums:sync
 *
 * NO API KEY. Flickr restricted new API keys to Pro accounts, so this takes
 * the keyless route instead. Three sources, because no single one is enough:
 *
 *   1. the albums page      album ids and titles
 *   2. each album page      that album's photo ids and its true photo count
 *   3. oEmbed, per photo    the photo's title and its *standard* secret
 *
 * Step 3 is the one that is not obvious. A Flickr image URL is
 * `{server}/{id}_{secret}_{size}.jpg`, and the size suffix cannot simply be
 * rewritten: the very large sizes (`_h`, `_k`) carry a different secret from
 * the ordinary ones, and album pages embed only those. Rewriting `_h` down to
 * `_z` returns 410 Gone. oEmbed hands back the standard secret, which does
 * open `_n`/`_z`/`_c`/`_b` — so a 60KB thumbnail becomes reachable instead of
 * a 1600px original shown at 200px tall.
 *
 * ---------------------------------------------------------------------------
 * A caveat this file should not hide: flickr.com/robots.txt ends with
 * `User-agent: *` / `Disallow: /`. Steps 1 and 2 read pages that directive
 * covers. It is done here because the content is the owner's own, public, and
 * the volume is a few dozen requests a day — and deliberately not done in a
 * way that evades anything: there is no browser emulation and no challenge
 * solving, so if Flickr ever puts a bot check in front of these pages the
 * sync fails loudly rather than working around it. oEmbed, by contrast, is
 * built for third-party use and is unambiguously fair game.
 *
 * When there is a real backend, replace steps 1 and 2 with the API and this
 * whole file becomes forty lines.
 * ---------------------------------------------------------------------------
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(ROOT, 'src/content/albums');
const OVERRIDES = path.join(ROOT, 'src/content/albums-overrides.json');

const USER = process.env.FLICKR_USER ?? 'shinigamae';

/** Photos pulled per album for the strip. The rest stay on Flickr. */
const STRIP_LIMIT = 10;

/** Courtesy gap between requests. Nothing here is in a hurry. */
const THROTTLE_MS = 250;

/** Honest about what this is, so it can be blocked deliberately if unwanted. */
const UA = 'shinigamae.dev-content-sync/1.0 (+https://github.com/Shinigamae/air-chrysalis)';

const WRITE = !process.argv.includes('--check');

/* ------------------------------------------------------------------ *
 * Fetch
 * ------------------------------------------------------------------ */

class BlockedError extends Error {}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchText(url, { attempts = 4, label = url } = {}) {
  for (let attempt = 1; ; attempt++) {
    try {
      const response = await fetch(url, { headers: { 'User-Agent': UA } });
      const text = await response.text();

      // A bot challenge is a refusal, not a transient error. Say so and stop
      // rather than reaching for a headless browser.
      if (/Just a moment|cf-browser-verification|Enable JavaScript and cookies/i.test(text)) {
        throw new BlockedError(
          [
            'Flickr served a bot challenge instead of the page.',
            '  This sync reads public pages directly and deliberately does not',
            '  try to defeat that. If it persists, the options are a Flickr Pro',
            '  account (which restores API access, and scripts/flickr-sync.mjs',
            '  becomes far simpler) or listing album URLs by hand.',
            `  (while fetching ${label})`,
          ].join('\n'),
        );
      }
      if (response.status === 429) {
        throw new Error(`rate limited (429) on ${label}`);
      }
      if (!response.ok) throw new Error(`${response.status} on ${label}`);
      return text;
    } catch (error) {
      if (error instanceof BlockedError || attempt >= attempts) throw error;
      console.warn(`  retrying (${attempt}/${attempts - 1}): ${error.cause?.code ?? error.message}`);
      await sleep(500 * 2 ** (attempt - 1));
    }
  }
}

async function fetchJson(url, opts) {
  const text = await fetchText(url, opts);
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`expected JSON from ${opts?.label ?? url}, got ${text.slice(0, 60)}`);
  }
}

/* ------------------------------------------------------------------ *
 * Parsing
 * ------------------------------------------------------------------ */

const decode = (text) =>
  text
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;|&rsquo;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();

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

const meta = (html, property) => {
  const m = html.match(
    new RegExp(`<meta property="${property}" content="([^"]*)"`, 'i'),
  );
  return m ? decode(m[1]) : '';
};

/** Album ids and titles, in the order the page lists them. */
function parseAlbumList(html) {
  const seen = new Map();
  const re = /href="\/photos\/[^/"]+\/albums\/(\d+)"\s+title="([^"]*)"/g;
  for (const [, id, title] of html.matchAll(re)) {
    if (!seen.has(id)) seen.set(id, decode(title));
  }
  return [...seen].map(([id, title]) => ({ id, title }));
}

/**
 * Photo ids in an album, and how many photos the album really holds.
 *
 * The page embeds large-size URLs, which is where the ids come from; the
 * secrets in them are the wrong ones for thumbnails, so only the id is kept.
 */
function parseAlbumPage(html) {
  const ids = [];
  for (const [, id] of html.matchAll(
    /live\.staticflickr\.com\/\d+\/(\d{8,12})_[0-9a-f]+_[a-z]\.jpg/g,
  )) {
    if (!ids.includes(id)) ids.push(id);
  }

  // The largest "N photos" on the page rather than the first, so a smaller
  // unrelated number earlier in the markup cannot win.
  const stated = Math.max(
    0,
    ...[...html.matchAll(/([\d,]+)\s*photos?\b/gi)].map((m) => Number(m[1].replace(/,/g, ''))),
  );

  const description = meta(html, 'og:description');

  return {
    ids,
    // Trust the stated count when it is at least what we found — it includes
    // photos further down the page than the markup carries.
    photoCount: Math.max(stated, ids.length),
    // Flickr fills og:description with boilerplate when an album has none.
    description: /Explore this photo album|photos? on Flickr|Flickr is almost certainly/i.test(
      description,
    )
      ? ''
      : description,
    title: decode((html.match(/<title>([^<]*)<\/title>/) ?? [])[1] ?? '').replace(/\s*\|\s*Flickr$/, ''),
  };
}

/**
 * oEmbed for one photo: its title, and the standard secret that makes normal
 * sizes reachable. The returned thumbnail is a 150px square crop, so the
 * useful part is the URL's shape, not the image itself.
 */
async function photoSizes(photoId) {
  const page = `https://www.flickr.com/photos/${USER}/${photoId}/`;
  const json = await fetchJson(
    `https://www.flickr.com/services/oembed/?format=json&url=${encodeURIComponent(page)}`,
    { label: `oembed ${photoId}` },
  );
  const m = String(json.thumbnail_url ?? '').match(
    /^(https:\/\/live\.staticflickr\.com\/\d+\/\d+_[0-9a-f]+)_[a-z]\.jpg$/,
  );
  if (!m) return null;
  return {
    id: photoId,
    title: decode(json.title ?? ''),
    // 640px wide: the strip shows frames ~200px tall, so this survives a
    // retina screen without being an original.
    thumb: `${m[1]}_z.jpg`,
    // 1024px, for the click-through.
    large: `${m[1]}_b.jpg`,
    page,
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
  const listHtml = await fetchText(`https://www.flickr.com/photos/${USER}/albums`, {
    label: 'albums page',
  });
  const albumRefs = parseAlbumList(listHtml);

  if (albumRefs.length === 0) {
    throw new Error(
      'No albums found on the albums page — refusing to empty the collection.\n' +
        '  Flickr may have changed its markup; parseAlbumList() needs a look.',
    );
  }
  console.log(`${albumRefs.length} albums listed`);

  const overrides = await readOverrides();
  const entries = new Map();

  // Oldest last on the page, so reverse for stable ordinals counting up from
  // the oldest album.
  const ordered = [...albumRefs].reverse();

  for (const [i, ref] of ordered.entries()) {
    await sleep(THROTTLE_MS);
    const url = `https://www.flickr.com/photos/${USER}/albums/${ref.id}`;
    const page = parseAlbumPage(await fetchText(url, { label: `album ${ref.id}` }));

    const photos = [];
    for (const photoId of page.ids.slice(0, STRIP_LIMIT)) {
      await sleep(THROTTLE_MS);
      const photo = await photoSizes(photoId);
      if (photo) photos.push(photo);
    }

    if (photos.length === 0) {
      console.log(`skip    ${slugify(ref.title)} (no photos resolved)`);
      continue;
    }

    const title = page.title || ref.title || `Album ${ref.id}`;
    let slug = slugify(title) || `album-${ref.id}`;
    if (entries.has(slug)) slug = `${slug}-${ref.id}`;

    const data = {
      title: title.toUpperCase(),
      description: page.description,
      index: i + 1,
      flickrId: ref.id,
      flickrUrl: url,
      photoCount: page.photoCount,
      photos,
    };
    Object.assign(data, overrides[slug] ?? {});
    entries.set(slug, data);
    console.log(
      `album   ${slug} — ${photos.length} of ${page.photoCount} photos`,
    );
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

  const shown = [...entries.values()].reduce((n, a) => n + a.photos.length, 0);
  const total = [...entries.values()].reduce((n, a) => n + a.photoCount, 0);
  console.log(
    `\n${entries.size} albums — ${shown} photos on the site, ${total} on Flickr.\n` +
      `${written} written, ${stale.length} removed` +
      (WRITE ? '' : ' (--check: nothing written)'),
  );
}

try {
  await main();
} catch (error) {
  if (error instanceof BlockedError) {
    console.error(`\n${error.message}\n`);
    process.exitCode = 1;
  } else {
    throw error;
  }
}
