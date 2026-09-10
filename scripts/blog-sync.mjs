#!/usr/bin/env node
/**
 * blog-sync — build the BUILD ARCHIVE content collection from the Blogspot feed.
 *
 *   npm run blog:sync          rewrite src/content/builds/*.json
 *   npm run blog:check         report what would change, write nothing
 *
 * The blog is the single source of truth for *content* — review text, photos,
 * video, dates. It cannot supply the structured fields the archive renders in
 * its kicker and spec list, because the post title only carries them by
 * convention and the convention is not always followed. So anything the parser
 * cannot derive is looked up in builds-overrides.json, keyed by slug.
 *
 * Photos are hotlinked from Google's CDN rather than downloaded, so the repo
 * stays small; the trade is that the archive depends on those URLs surviving.
 *
 * Written against the Blogger v1 Atom feed, requested as JSON. Note that
 * `alt=json` returns the same documents as the XML feed the browser shows,
 * with `$t` wrappers around text nodes.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(ROOT, 'src/content/builds');
const OVERRIDES = path.join(ROOT, 'src/content/builds-overrides.json');

const FEED = 'https://shinigamae.blogspot.com/feeds/posts/default';
/** Blogger caps this at 500; we page anyway so the archive can outgrow it. */
const PAGE_SIZE = 500;

const WRITE = !process.argv.includes('--check');

/* ------------------------------------------------------------------ *
 * Vocabulary
 *
 * These maps are the project's opinion, not the blog's. Tags are freeform and
 * a little inconsistent (`badai`, `Cosmis Era`), so they are normalised here
 * rather than corrected upstream — retagging 33 posts would break nothing but
 * would make the blog's own tag cloud worse.
 * ------------------------------------------------------------------ */

/** Longest first: MGSD must win before MG can match. */
const GRADES = ['MGSD', 'MGEX', 'MODEROID', 'HIRM', 'PG', 'MG', 'RG', 'HG', 'FM', 'RE', 'EG', 'SD'];

/** Grade tokens that are really a product line, cased as the maker writes them. */
const GRADE_CASING = { HIRM: 'HiRM', MODEROID: 'MODEROID', MGSD: 'MGSD', MGEX: 'MGEX' };

const SERIES_BY_TAG = {
  'universal century': 'Universal Century',
  'char counterattack': "Char's Counterattack",
  'stardus memories': '0083 Stardust Memory',
  zeta: 'Zeta Gundam',
  zz: 'ZZ Gundam',
  aoz: 'Advance of Zeta',
  'cosmic era': 'Cosmic Era',
  'cosmis era': 'Cosmic Era',
  seed: 'SEED',
  'seed destiny': 'SEED Destiny',
  'seed astray': 'SEED Astray',
  'seed freedom': 'SEED Freedom',
  stargazer: 'Stargazer',
  'after colony': 'After Colony',
  'endless waltz': 'Endless Waltz',
  'operation meteor': 'Operation Meteor',
  'anno domini': 'Anno Domini',
  '00': 'Gundam 00',
  twfm: 'The Witch from Mercury',
  'legend of star generals': 'Legend of Star Generals',
  horizon: 'Horizon Zero Dawn',
  'zero dawn': 'Horizon Zero Dawn',
  supernova: 'Supernova',
  'doom mecha': 'Honor of Kings',
};

/**
 * Most specific first. A post tagged both `seed` and `seed destiny` belongs to
 * Destiny; taking the first tag alphabetically would silently pick the wrong
 * one, so precedence is explicit.
 */
const SERIES_PRECEDENCE = [
  'seed freedom', 'seed destiny', 'seed astray', 'stargazer', 'seed',
  'char counterattack', 'stardus memories', 'aoz', 'zz', 'zeta', 'universal century',
  'endless waltz', 'operation meteor', 'after colony',
  'twfm', '00', 'anno domini',
  'legend of star generals', 'zero dawn', 'horizon', 'supernova', 'doom mecha',
  'cosmic era', 'cosmis era',
];

/** Most specific first, for the same reason — everything mecha is `mecha`. */
const KIND_BY_TAG = [
  ['mobile suit', 'MOBILE SUIT'],
  ['humanoid', 'HUMANOID'],
  ['equipment', 'EQUIPMENT'],
  ['mecha', 'MECHA'],
];

/** Tags that describe taxonomy rather than the kit; not worth surfacing. */
const NOISE_TAGS = new Set(['model kit', 'gunpla', 'mecha', 'gundam', 'mobile suit', 'humanoid']);

/* ------------------------------------------------------------------ *
 * Parsing
 * ------------------------------------------------------------------ */

function slugify(text) {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    // Elided rather than separated, so "Horizon's" is horizons, not horizon-s.
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 72);
}

const decodeEntities = (text) =>
  text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");

const stripTags = (html) => decodeEntities(html.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

/**
 * Title convention is "Brand | Scale/Grade | Model kit name", but 8 of 33
 * posts drop the middle segment. Treat first as brand, last as name, and mine
 * the whole string for grade and scale wherever they landed.
 */
function parseTitle(rawTitle) {
  const raw = rawTitle.trim().replace(/\s+/g, ' ');
  const parts = raw.split('|').map((s) => s.trim()).filter(Boolean);

  const manufacturer = parts[0] ?? raw;
  // A dropped middle segment leaves the scale glued to the name
  // ("1/100 MSR-00100 Hyaku Shiki Kai") — pull it off so it is not duplicated.
  const name = (parts.length > 1 ? parts.at(-1) : raw).replace(/^\d+\/\d+\s+/, '').trim();

  // Word-split instead of \b regexes: "8832 1/100" and "MG 1/100" both need to
  // yield their grade token, and / is not a word boundary in the useful place.
  const tokens = new Set(raw.toUpperCase().split(/[^A-Z0-9]+/).filter(Boolean));
  const gradeToken = GRADES.find((g) => tokens.has(g));

  return {
    manufacturer,
    name,
    grade: gradeToken ? (GRADE_CASING[gradeToken] ?? gradeToken) : null,
    // The blog writes 1/144, the design writes 1:144.
    scale: ((raw.match(/(\d+)\/(\d+)/) ?? []).slice(1, 3).join(':')) || null,
  };
}

/**
 * Blogger wraps every photo in a `<div class="separator">` with a link to the
 * full-size original. Drop those wrappers from the prose and collect the
 * images separately, so the body reads as text and the photos go to the
 * PHOTO SET grid where the design puts them.
 */
function parseContent(html) {
  const video = (html.match(/youtube-src-id="([^"]+)"/) ?? [])[1] ?? null;

  const gallery = [...html.matchAll(/<img[^>]+src="([^"]+)"/g)]
    .map((m) => decodeEntities(m[1]))
    // /w528-h297/ and /s320/ are Blogger's display crops; /s1600/ is the original.
    .map((url) => url.replace(/\/(?:s\d+|w\d+-h\d+)(?:-[a-z]+)?\//, '/s1600/'))
    .filter((url, i, all) => all.indexOf(url) === i);

  const prose = html
    .replace(/<(script|style|iframe)\b[\s\S]*?<\/\1>/gi, '')
    .replace(/<div class="separator"[\s\S]*?<\/div>/gi, '')
    .replace(/<a\b[^>]*>\s*<\/a>/gi, '');

  // Blogger writes each line as its own <div>, including blank spacer divs.
  const blocks = [...prose.matchAll(/<(p|div|li)\b[^>]*>([\s\S]*?)<\/\1>/gi)]
    .map((m) => stripTags(m[2]))
    .filter(Boolean);

  const summary = blocks.find((b) => b.length > 60) ?? blocks.find((b) => b.length > 20) ?? '';

  // Some posts group their bullets under "Pros:" / "Cons:" headings. Track
  // which heading was last seen so the two do not collapse into one flat list
  // where "The gates are thick" reads as praise. Bullets before any heading
  // are unclassified and stay in `notes`.
  const notes = [];
  const pros = [];
  const cons = [];
  let bucket = notes;
  for (const block of blocks) {
    if (/^pros\b/i.test(block)) { bucket = pros; continue; }
    if (/^cons\b/i.test(block)) { bucket = cons; continue; }
    if (!/^[-–—]\s*\S/.test(block)) continue;
    const text = block.replace(/^[-–—]\s*/, '').trim();
    if (text.length > 3) bucket.push(text);
  }

  // Headings and bullets are pulled out above; the body keeps only the prose.
  const body = blocks.filter((b) => !/^[-–—]\s/.test(b) && !/^(pros|cons)\b:?\s*$/i.test(b));

  return { video, gallery, summary, notes, pros, cons, body };
}

function toEntry(post, ordinal) {
  const rawTitle = post.title.$t;
  const { manufacturer, name, grade, scale } = parseTitle(rawTitle);
  const tags = (post.category ?? []).map((c) => c.term.toLowerCase());
  const { video, gallery, summary, notes, pros, cons, body } = parseContent(post.content?.$t ?? '');

  const seriesTag = SERIES_PRECEDENCE.find((t) => tags.includes(t));
  const kind = (KIND_BY_TAG.find(([tag]) => tags.includes(tag)) ?? [null, 'MECHA'])[1];

  const permalink = (post.link ?? []).find((l) => l.rel === 'alternate')?.href ?? null;
  const published = post.published.$t;

  return {
    slug: slugify(name || rawTitle),
    data: {
      title: name.toUpperCase(),
      grade: grade ?? (tags.includes('metal build') ? 'METAL BUILD' : undefined),
      scale: scale ?? undefined,
      kind,
      series: seriesTag ? SERIES_BY_TAG[seriesTag] : undefined,
      manufacturer,
      buildDate: published.slice(0, 7),
      summary,
      notes,
      pros,
      cons,
      status: 'archive',
      index: ordinal,
      // Every post opens with a video, so its thumbnail is the one image
      // guaranteed to exist — including for the three posts with no photos.
      hero: video ? `https://img.youtube.com/vi/${video}/maxresdefault.jpg` : gallery[0],
      gallery,
      body,
      video: video ?? undefined,
      sourceUrl: permalink ?? undefined,
      tags: tags.filter((t) => !NOISE_TAGS.has(t) && !/^\d+\/\d+$/.test(t)).sort(),
    },
  };
}

/* ------------------------------------------------------------------ *
 * Feed
 * ------------------------------------------------------------------ */

/** Connections to the feed reset intermittently; a dropped socket is not a reason
 *  to fail a sync that would otherwise succeed on the next attempt. */
async function fetchJson(url, attempts = 4) {
  for (let attempt = 1; ; attempt++) {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Feed request failed: ${response.status} ${response.statusText}`);
      }
      return await response.json();
    } catch (error) {
      if (attempt >= attempts) throw error;
      const backoff = 500 * 2 ** (attempt - 1);
      console.warn(`  retrying (${attempt}/${attempts - 1}): ${error.cause?.code ?? error.message}`);
      await new Promise((resolve) => setTimeout(resolve, backoff));
    }
  }
}

async function fetchAllPosts() {
  const posts = [];
  for (let start = 1; ; start += PAGE_SIZE) {
    const url = `${FEED}?alt=json&max-results=${PAGE_SIZE}&start-index=${start}`;
    const entries = (await fetchJson(url)).feed.entry ?? [];
    posts.push(...entries);
    if (entries.length < PAGE_SIZE) return posts;
  }
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

/** Drop keys the schema treats as optional rather than writing nulls. */
const compact = (data) =>
  Object.fromEntries(
    Object.entries(data).filter(([, v]) => v !== undefined && v !== null && v !== ''),
  );

const posts = await fetchAllPosts();
if (posts.length === 0) throw new Error('Feed returned no posts — refusing to empty the archive.');

const overrides = await readOverrides();

// Oldest post is 01, so an existing build keeps its ordinal when a new one
// is published. Ordinals are shown on the cards and should be stable.
const ordered = [...posts].sort((a, b) => a.published.$t.localeCompare(b.published.$t));
const entries = ordered.map((post, i) => toEntry(post, i + 1));

const seen = new Map();
for (const entry of entries) {
  if (seen.has(entry.slug)) throw new Error(`Duplicate slug "${entry.slug}" — rename one post.`);
  seen.set(entry.slug, entry);
  Object.assign(entry.data, overrides[entry.slug] ?? {});
}

// A post deleted from the blog should disappear from the archive, but only
// generated files are ever removed.
const existing = (await fs.readdir(OUT_DIR).catch(() => [])).filter((f) => f.endsWith('.json'));
const wanted = new Set(entries.map((e) => `${e.slug}.json`));
const stale = existing.filter((f) => !wanted.has(f));

let written = 0;
for (const entry of entries) {
  const file = path.join(OUT_DIR, `${entry.slug}.json`);
  const next = `${JSON.stringify(compact(entry.data), null, 2)}\n`;
  const prev = await fs.readFile(file, 'utf8').catch(() => null);
  if (prev === next) continue;
  written++;
  if (WRITE) await fs.mkdir(OUT_DIR, { recursive: true }).then(() => fs.writeFile(file, next));
  console.log(`${prev === null ? 'new    ' : 'update '} ${entry.slug}`);
}
for (const file of stale) {
  console.log(`remove  ${file.replace(/\.json$/, '')}`);
  if (WRITE) await fs.unlink(path.join(OUT_DIR, file));
}

const gaps = entries.filter((e) => !e.data.grade || !e.data.scale || !e.data.series);
if (gaps.length > 0) {
  console.log(`\n${gaps.length} of ${entries.length} entries are missing grade/scale/series.`);
  console.log(`Fill them in ${path.relative(ROOT, OVERRIDES)}:`);
  for (const e of gaps) {
    const missing = ['grade', 'scale', 'series'].filter((k) => !e.data[k]);
    console.log(`  ${e.slug.padEnd(46)} ${missing.join(', ')}`);
  }
}

console.log(
  `\n${entries.length} posts — ${written} written, ${stale.length} removed` +
    (WRITE ? '' : ' (--check: nothing written)'),
);
