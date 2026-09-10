#!/usr/bin/env node
/**
 * goodreads-sync — build the READING LOG content collection from Goodreads.
 *
 *   npm run books:sync           rewrite src/content/books/*.json
 *   npm run books:check          report what would change, write nothing
 *
 *   GOODREADS_USER=1 npm run books:check    read a different profile
 *
 * Goodreads retired their API — no keys have been issued since December 2020
 * — but the per-shelf RSS feed survives and carries more than the old API's
 * basic review call did: cover art, page count, publication year, the
 * average rating, and the review text.
 *
 * The feed is public only if the shelf is. A private shelf answers every
 * request with `401 Sorry, that person's shelf is private`, which this script
 * reports as such rather than as a generic HTTP failure, because that error
 * means "change a setting on goodreads.com", not "the sync is broken".
 *
 * Structured the same way as blog-sync.mjs: generated files are disposable,
 * and anything the feed gets wrong is corrected in books-overrides.json.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(ROOT, 'src/content/books');
const OVERRIDES = path.join(ROOT, 'src/content/books-overrides.json');

const USER = process.env.GOODREADS_USER ?? '61182361';
const FEED = (shelf, page) =>
  `https://www.goodreads.com/review/list_rss/${USER}?shelf=${shelf}&page=${page}`;

/** Goodreads pages the feed at 100 and ignores any request for more. */
const PAGE_SIZE = 100;

/** Goodreads 403s an unrecognised agent. */
const UA = 'Mozilla/5.0 (compatible; shinigamae.dev content sync)';

const WRITE = !process.argv.includes('--check');

/* ------------------------------------------------------------------ *
 * XML
 *
 * The feed is flat, CDATA-wrapped and machine-generated, so a handful of
 * regexes beat taking on an XML parser dependency for one script.
 * ------------------------------------------------------------------ */

const decodeEntities = (text) =>
  text
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    // Last: an escaped ampersand must not re-open another entity.
    .replace(/&amp;/g, '&');

function field(chunk, tag) {
  const match = chunk.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
  if (!match) return '';
  return decodeEntities(
    match[1].replace(/^\s*<!\[CDATA\[/, '').replace(/\]\]>\s*$/, ''),
  ).trim();
}

/** Feed HTML (reviews especially) → paragraphs of plain text. */
function paragraphs(html) {
  if (!html) return [];
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .split(/\n{2,}/)
    .map((p) => p.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

/** "Mon, 7 Sep 2026 00:00:00 +0000" → "2026-09-07". */
function isoDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

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

/* ------------------------------------------------------------------ *
 * Fetch
 * ------------------------------------------------------------------ */

class PrivateShelfError extends Error {}

async function fetchText(url, attempts = 4) {
  for (let attempt = 1; ; attempt++) {
    try {
      const response = await fetch(url, { headers: { 'User-Agent': UA } });
      const text = await response.text();
      if (response.status === 401 || /shelf is private/i.test(text)) {
        throw new PrivateShelfError(
          `Goodreads says this shelf is private.\n` +
            `  Make it public at https://www.goodreads.com/user/edit?tab=settings\n` +
            `  (Settings → Privacy → who can view your shelves), or point\n` +
            `  GOODREADS_USER at a public profile.`,
        );
      }
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      return text;
    } catch (error) {
      // A privacy setting will not fix itself on the next attempt.
      if (error instanceof PrivateShelfError || attempt >= attempts) throw error;
      const backoff = 500 * 2 ** (attempt - 1);
      console.warn(`  retrying (${attempt}/${attempts - 1}): ${error.cause?.code ?? error.message}`);
      await new Promise((resolve) => setTimeout(resolve, backoff));
    }
  }
}

async function fetchShelf(shelf) {
  const items = [];
  for (let page = 1; ; page++) {
    const xml = await fetchText(FEED(shelf, page));
    const chunks = xml
      .split('<item>')
      .slice(1)
      .map((c) => c.slice(0, c.indexOf('</item>')));
    items.push(...chunks);
    if (chunks.length < PAGE_SIZE) return items;
  }
}

/* ------------------------------------------------------------------ *
 * Mapping
 * ------------------------------------------------------------------ */

function toEntry(chunk, { current }) {
  const title = field(chunk, 'title');
  const author = field(chunk, 'author_name');

  // 0 is Goodreads' "no rating", not a rating of zero.
  const ratingRaw = Number(field(chunk, 'user_rating'));
  const rating = Number.isFinite(ratingRaw) && ratingRaw > 0 ? ratingRaw : null;

  const review = paragraphs(field(chunk, 'user_review'));
  const bookId = field(chunk, 'book_id');
  const pages = Number(field(chunk, 'num_pages'));
  const published = Number(field(chunk, 'book_published'));
  const average = Number(field(chunk, 'average_rating'));

  const shelves = field(chunk, 'user_shelves')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  return {
    slug: slugify(`${title} ${author}`) || `book-${bookId}`,
    bookId,
    data: {
      title: title.toUpperCase(),
      author,
      source: 'GOODREADS',
      rating,
      // The card shows the lead; the detail page shows the rest.
      thought: review[0] ?? '',
      review: review.slice(1),
      finishedOn: isoDate(field(chunk, 'user_read_at')),
      addedOn: isoDate(field(chunk, 'user_date_added')),
      current,
      // Only "currently reading" is genuinely live; the rest is the archive.
      status: current ? 'live' : 'archive',
      cover: field(chunk, 'book_large_image_url') || null,
      pages: Number.isFinite(pages) && pages > 0 ? pages : null,
      published: Number.isFinite(published) && published > 0 ? published : null,
      averageRating: Number.isFinite(average) && average > 0 ? average : null,
      isbn: field(chunk, 'isbn') || null,
      goodreadsUrl: field(chunk, 'link').split('?')[0] || null,
      shelves,
    },
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
  // Currently-reading first: a book on both shelves should keep `current`.
  const reading = await fetchShelf('currently-reading');
  const read = await fetchShelf('read');

  const entries = [
    ...reading.map((c) => toEntry(c, { current: true })),
    ...read.map((c) => toEntry(c, { current: false })),
  ];

  if (entries.length === 0) {
    throw new Error('Goodreads returned no books - refusing to empty the reading log.');
  }

  const overrides = await readOverrides();

  const bySlug = new Map();
  for (const entry of entries) {
    // A book on both shelves arrives twice; the currently-reading copy wins
    // because it was mapped first.
    if (bySlug.has(entry.slug)) {
      if (bySlug.get(entry.slug).bookId === entry.bookId) continue;
      // Two different books really can share a title and author (reissues).
      entry.slug = `${entry.slug}-${entry.bookId}`;
    }
    bySlug.set(entry.slug, entry);
  }

  for (const [slug, entry] of bySlug) {
    Object.assign(entry.data, overrides[slug] ?? {});
  }

  const existing = (await fs.readdir(OUT_DIR).catch(() => [])).filter((f) => f.endsWith('.json'));
  const wanted = new Set([...bySlug.keys()].map((s) => `${s}.json`));
  const stale = existing.filter((f) => !wanted.has(f));

  await fs.mkdir(OUT_DIR, { recursive: true });

  let written = 0;
  for (const [slug, entry] of bySlug) {
    const file = path.join(OUT_DIR, `${slug}.json`);
    const next = `${JSON.stringify(compact(entry.data), null, 2)}
`;
    const prev = await fs.readFile(file, 'utf8').catch(() => null);
    if (prev === next) continue;
    written++;
    if (WRITE) await fs.writeFile(file, next);
    console.log(`${prev === null ? 'new    ' : 'update '} ${slug}`);
  }
  for (const file of stale) {
    console.log(`remove  ${file.replace(/\.json$/, '')}`);
    if (WRITE) await fs.unlink(path.join(OUT_DIR, file));
  }

  const undated = [...bySlug.values()].filter((e) => !e.data.finishedOn && !e.data.current);
  if (undated.length > 0) {
    console.log(
      `
${undated.length} of ${bySlug.size} read books have no finish date, so they` +
        ` sort by date added and stay off the timeline. Set "finishedOn" in` +
        ` ${path.relative(ROOT, OVERRIDES)} for any worth placing.`,
    );
  }

  console.log(
    `
${bySlug.size} books (${reading.length} currently reading) -` +
      ` ${written} written, ${stale.length} removed` +
      (WRITE ? '' : ' (--check: nothing written)'),
  );
}

try {
  await main();
} catch (error) {
  // A privacy setting is something to go and change, not a stack trace.
  if (error instanceof PrivateShelfError) {
    console.error(`
${error.message}
`);
    process.exitCode = 1;
  } else {
    throw error;
  }
}
