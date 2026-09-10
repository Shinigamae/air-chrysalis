#!/usr/bin/env node
/**
 * psn-sync — build the GAMING LOG content collection from PlayStation Network.
 *
 *   npm run games:sync            rewrite src/content/games/*.json
 *   npm run games:check           report what would change, write nothing
 *
 * Not scraped from psnprofiles.com. That site sits behind a Cloudflare
 * JavaScript challenge and its robots.txt disallows automated agents, so the
 * data is taken from Sony directly — the same account, one hop closer, and
 * nothing to evade.
 *
 * Two endpoints are merged, because neither is enough alone:
 *
 *   getUserTitles      trophy progress (0-100), trophy counts, platform.
 *                      This is the spine: `progress` is the field the Gaming
 *                      Log design is built around.
 *   getUserPlayedGames playtime, first/last played, cover art. Sony's trophy
 *                      API knows nothing about hours.
 *
 * They use different id spaces (npCommunicationId vs titleId), so they are
 * matched on a normalised title. A game that fails to match still imports,
 * just without playtime.
 *
 * The npsso token is a credential with roughly a two-month life. It lives in
 * .env locally (gitignored, same as FIGMA_TOKEN) and in the PSN_NPSSO Actions
 * secret in CI. When it lapses this script says so plainly.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  exchangeNpssoForAccessCode,
  exchangeAccessCodeForAuthTokens,
  getUserTitles,
  getUserPlayedGames,
} from 'psn-api';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(ROOT, 'src/content/games');
const OVERRIDES = path.join(ROOT, 'src/content/games-overrides.json');

const WRITE = !process.argv.includes('--check');

/** The data API, kept here so the reachability error can name it. */
const API_HOST = 'm.np.playstation.com';

/** Sony caps these; both endpoints page the same way. */
const PAGE_SIZE = 100;

/**
 * A game counts as played once it has earned a single trophy. Below that the
 * list fills with demos, PS Plus freebies and things launched once to look at
 * — a shelf of noise rather than a log of playing.
 */
const MIN_PROGRESS = 1;

/** Days since last trophy within which a game still counts as being played. */
const ACTIVE_DAYS = 60;

/* ------------------------------------------------------------------ *
 * Credential
 * ------------------------------------------------------------------ */

class TokenError extends Error {}

/** The API answered with something other than JSON — a block page, usually. */
class UnreachableError extends Error {}

function readNpsso() {
  if (!process.env.PSN_NPSSO) {
    try {
      process.loadEnvFile(path.join(ROOT, '.env'));
    } catch {
      /* no .env — fall through to the error below */
    }
  }
  const npsso = process.env.PSN_NPSSO;
  if (!npsso) {
    throw new TokenError(
      'PSN_NPSSO is not set.\n' +
        '  1. Sign in at https://www.playstation.com\n' +
        '  2. Open https://ca.account.sony.com/api/v1/ssocookie in the same browser\n' +
        '  3. Copy the "npsso" value from the JSON it returns\n' +
        '  Then put PSN_NPSSO=... in .env (already gitignored), or set the\n' +
        '  PSN_NPSSO secret for GitHub Actions. It lasts about two months.',
    );
  }
  return npsso.trim();
}

/* ------------------------------------------------------------------ *
 * Shaping
 * ------------------------------------------------------------------ */

/**
 * Trademark furniture, and the name of the thing being described.
 *
 * A trophy set is not always named after the game: PSN carries "Catherine
 * Trophy", "TITANFALL 2 Trophies", "EA SPORTS FC 26 Trophies". The suffix is
 * an artefact of the endpoint, not part of the title, so it goes — but only
 * as a suffix, so a game genuinely called "Trophy" something survives.
 */
const stripMarks = (text) =>
  text
    .replace(/[™®©]/g, '')
    .replace(/\s+(?:trophy|trophies)(?:\s+set)?\s*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();

function slugify(text) {
  return stripMarks(text)
    // NFKD expands the trademark sign into the letters "TM", so it has to be
    // stripped before this line, not after: "ELDEN RING™" -> "elden-ringtm".
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 72);
}

/**
 * Match key across the two endpoints. Trophy lists and the games list spell
 * the same game differently — trademark symbols, edition suffixes, the
 * platform tacked on — so both sides are reduced to letters and digits.
 */
const matchKey = (name) =>
  stripMarks(name)
    .toLowerCase()
    .replace(/\b(ps4|ps5|playstation|remastered|definitive|deluxe|goty|edition)\b/g, '')
    .replace(/[^a-z0-9]/g, '');

/** "PT228H56M33S" -> 228.9 hours. */
function durationToHours(value) {
  if (!value) return null;
  const m = value.match(/^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:([\d.]+)S)?$/);
  if (!m) return null;
  const [, d, h, min, s] = m.map((x) => (x === undefined ? 0 : Number(x)));
  const hours = d * 24 + h + min / 60 + s / 3600;
  return hours > 0 ? Math.round(hours * 10) / 10 : null;
}

/** PS5 / PS4 / PSVITA, as the design writes it. */
function platformLabel(raw) {
  if (!raw) return 'PLAYSTATION';
  return raw
    .split(',')
    .map((p) => p.trim().toUpperCase())
    .filter(Boolean)
    .join(' / ');
}

const daysSince = (iso) =>
  iso ? (Date.now() - new Date(iso).getTime()) / 86_400_000 : Infinity;

/**
 * Inferred rather than declared, and deliberately incurious about the rest.
 *
 * This used to return `abandoned` for anything stalled, which labelled 190
 * games as failures purely because they were old. PSN cannot tell the
 * difference between a game you gave up on and one you finished your way
 * without the trophies, so it does not guess: `played` is the honest word.
 * `abandoned` and `backlog` exist, but only an override may claim them.
 */
function playStatusFor({ progress, platinum, lastPlayed }) {
  if (progress >= 100 || platinum) return 'finished';
  if (daysSince(lastPlayed) <= ACTIVE_DAYS) return 'in-progress';
  return 'played';
}

/* ------------------------------------------------------------------ *
 * Fetch
 * ------------------------------------------------------------------ */

async function pageThrough(fetchPage, key) {
  const all = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const response = await fetchPage({ limit: PAGE_SIZE, offset });
    const batch = response[key] ?? [];
    all.push(...batch);
    if (batch.length < PAGE_SIZE) return all;
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

const compact = (data) =>
  Object.fromEntries(
    Object.entries(data).filter(([, v]) => {
      if (v === undefined || v === null || v === '') return false;
      if (Array.isArray(v) && v.length === 0) return false;
      if (typeof v === 'object' && Object.keys(v).length === 0) return false;
      return true;
    }),
  );

async function authorise() {
  const npsso = readNpsso();
  try {
    const accessCode = await exchangeNpssoForAccessCode(npsso);
    return await exchangeAccessCodeForAuthTokens(accessCode);
  } catch (error) {
    // A dropped connection is not a bad token. Saying "your token expired"
    // when the network is at fault sends you off to regenerate a credential
    // that was fine, so the two are reported separately.
    const networkish =
      /fetch failed|ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|socket hang up/i.test(
        `${error.message} ${error.cause?.code ?? ''}`,
      );
    if (networkish) {
      throw new UnreachableError(
        [
          'Could not reach PSN to authenticate — the connection failed before',
          '  Sony answered, so the npsso token was never judged.',
          '  This network may be blocking or resetting the connection.',
          '  Run the sync from GitHub Actions instead:',
          '    gh workflow run content-sync.yml',
          `  (underlying error: ${error.cause?.code ?? error.message})`,
        ].join('\n'),
      );
    }
    throw new TokenError(
      'PSN rejected the npsso token — it has most likely expired.\n' +
        '  They last about two months. Get a fresh one from\n' +
        '  https://ca.account.sony.com/api/v1/ssocookie while signed in, then\n' +
        '  update .env locally and the PSN_NPSSO secret in GitHub.\n' +
        `  (underlying error: ${error.message})`,
    );
  }
}

async function main() {
  const auth = await authorise();

  let titles;
  let played;
  try {
    [titles, played] = await Promise.all([
      pageThrough((o) => getUserTitles(auth, 'me', o), 'trophyTitles'),
      pageThrough((o) => getUserPlayedGames(auth, 'me', o), 'titles'),
    ]);
  } catch (error) {
    // psn-api parses every response as JSON, so a proxy's block page or an
    // outage arrives as an opaque `Unexpected token '<'`. Name it instead.
    if (error instanceof SyntaxError || /not valid JSON|Unexpected token/.test(error.message)) {
      throw new UnreachableError(
        [
          'PSN answered with HTML where JSON was expected, so the request',
          '  never reached the API.',
          `  ${API_HOST} is commonly blocked on corporate and school networks,`,
          '  and Sony geo-restricts it in some regions. The npsso token',
          '  authenticated fine, so this is reachability, not the credential.',
          '  Run the sync from GitHub Actions instead, where egress is clean:',
          '    gh workflow run content-sync.yml',
        ].join('\n'),
      );
    }
    throw error;
  }

  if (titles.length === 0) {
    throw new Error('PSN returned no trophy titles — refusing to empty the gaming log.');
  }

  // Playtime, keyed for lookup. Later duplicates (the same game on two
  // platforms) fold into the first, whose playtime is the larger.
  const playtime = new Map();
  for (const game of played) {
    const key = matchKey(game.name ?? game.localizedName ?? '');
    if (!key) continue;
    const hours = durationToHours(game.playDuration);
    const existing = playtime.get(key);
    if (!existing || (hours ?? 0) > (existing.hours ?? 0)) {
      playtime.set(key, {
        hours,
        firstPlayedOn: game.firstPlayedDateTime?.slice(0, 10) ?? null,
        lastPlayedOn: game.lastPlayedDateTime?.slice(0, 10) ?? null,
        art: game.imageUrl ?? game.localizedImageUrl ?? null,
      });
    }
  }

  const kept = titles.filter((t) => !t.hiddenFlag && t.progress >= MIN_PROGRESS);

  // The single "CURRENTLY PLAYING" slot goes to the most recent trophy.
  const mostRecent = kept.reduce(
    (best, t) => (!best || t.lastUpdatedDateTime > best.lastUpdatedDateTime ? t : best),
    null,
  );

  const bySlug = new Map();
  for (const title of kept) {
    const name = stripMarks(title.trophyTitleName);
    const extra = playtime.get(matchKey(name)) ?? {};
    const lastPlayed = extra.lastPlayedOn ?? title.lastUpdatedDateTime;
    const platinum = (title.earnedTrophies?.platinum ?? 0) > 0;
    const isCurrent = title === mostRecent && daysSince(lastPlayed) <= ACTIVE_DAYS;

    // A title with no Latin characters at all — 明末：渊虚之羽, say — slugifies
    // to nothing, which wrote a hidden `.json` file and left the game with no
    // reachable detail route. Fall back to the trophy-set id: opaque in the
    // URL, but unique, stable across syncs, and it exists.
    let slug = slugify(name) || `game-${title.npCommunicationId.toLowerCase()}`;
    if (bySlug.has(slug)) slug = `${slug}-${slugify(title.trophyTitlePlatform)}`;

    bySlug.set(slug, {
      slug,
      data: {
        title: name.toUpperCase(),
        platform: platformLabel(title.trophyTitlePlatform),
        year: Number(String(lastPlayed).slice(0, 4)),
        progress: Math.round(title.progress),
        // Personal opinion is not Sony's to supply — both come from overrides.
        rating: null,
        playStatus: playStatusFor({ progress: title.progress, platinum, lastPlayed }),
        current: isCurrent,
        review: '',
        screenshots: [],
        status: isCurrent ? 'live' : 'archive',

        /* --- Imported from PSN --- */
        trophies: compact({
          earned: title.earnedTrophies ?? null,
          defined: title.definedTrophies ?? null,
        }),
        platinum,
        playtimeHours: extra.hours ?? null,
        firstPlayedOn: extra.firstPlayedOn ?? null,
        lastPlayedOn: String(lastPlayed).slice(0, 10),
        icon: title.trophyTitleIconUrl ?? null,
        art: extra.art ?? null,
      },
    });
  }

  const overrides = await readOverrides();
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
    const next = `${JSON.stringify(compact(entry.data), null, 2)}\n`;
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

  const matched = [...bySlug.values()].filter((e) => e.data.playtimeHours).length;
  console.log(
    `\n${titles.length} trophy titles, ${kept.length} above ${MIN_PROGRESS}% —` +
      ` ${bySlug.size} written to the log.`,
  );
  console.log(
    `${matched} matched a playtime record; ${bySlug.size - matched} did not and` +
      ' carry no hours.',
  );
  console.log(
    `${written} written, ${stale.length} removed` +
      (WRITE ? '' : ' (--check: nothing written)'),
  );
}

try {
  await main();
} catch (error) {
  // An expired credential, or a network that cannot see the API, is a thing
  // to go and deal with — not a stack trace.
  if (error instanceof TokenError || error instanceof UnreachableError) {
    console.error(`\n${error.message}\n`);
    process.exitCode = 1;
  } else {
    throw error;
  }
}
