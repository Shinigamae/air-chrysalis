/**
 * Render the icons and the link-preview card from the logos in src/assets.
 *
 *   npm run icons
 *
 * Writes into public/, and the output is committed — these change when the
 * logo does, not per build, so there is nothing to gain from rendering them
 * every time the site is built.
 *
 *   apple-touch-icon.png  180  iOS home screen, and Safari's tab icon
 *   icon-192.png          192  web manifest
 *   icon-512.png          512  web manifest, and install splash screens
 *   favicon-32.png         32  the fallback for browsers that ignore the SVG
 *   og.png          1200x630  the image LinkedIn, Slack, Discord et al. show
 *   og/<section>.png 1200x630 the same, per section — what AppShell picks for
 *                             any page under that section, detail pages too
 *
 * sharp comes in with Astro, which uses it for `astro:assets`, so this adds
 * no dependency of its own. If Astro ever stops shipping it, `npm i -D sharp`.
 */

import { mkdirSync } from 'node:fs';
import sharp from 'sharp';

const OUT = 'public';
const MARK = 'src/assets/logo-trans.png'; // white mark, transparent ground
const LOCKUP = 'src/assets/Shinigamae Logos.png'; // mark + wordmark, 1420x499

/* The page ground and the signal cyan, from src/styles/tokens.css. */
const CANVAS = '#09090b';
const SIGNAL = '#38bdf8';
const MUTED = '#a1a1aa';
/*
 * The lockup is drawn on an opaque #000 ground, not a transparent one, so the
 * preview card uses that black rather than the canvas — on #09090B the lockup
 * showed as a visible box.
 */
const BLACK = '#000000';

mkdirSync(OUT, { recursive: true });

/**
 * The mark on the page ground, filling `fill` of the square.
 *
 * An opaque ground and not a transparent one: iOS paints a transparent
 * touch icon onto black anyway, and the manifest icons are shown on
 * whatever colour a launcher likes — a white mark on a white launcher is gone.
 */
async function icon(size, file, fill = 0.78) {
  const inner = Math.round(size * fill);
  // Trimmed first: the PNG sits the mark off-centre in its own square.
  const trimmed = await sharp(MARK).trim().toBuffer();
  const mark = await sharp(trimmed)
    .resize(inner, inner, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toBuffer();
  await sharp({ create: { width: size, height: size, channels: 4, background: CANVAS } })
    .composite([{ input: mark, gravity: 'centre' }])
    .png({ compressionLevel: 9 })
    .toFile(`${OUT}/${file}`);
  console.log(`${OUT}/${file}`);
}

/**
 * The preview card: the lockup, a cyan rule, and the tagline in mono.
 *
 * The tagline is drawn by the system's SVG renderer, which cannot read the
 * site's woff2 fonts, so it asks for a generic monospace. At this size and
 * letter-spacing the difference from IBM Plex Mono does not survive a
 * thumbnail.
 */
async function og() {
  const W = 1200;
  const H = 630;
  const LW = 900;
  const lockup = await sharp(LOCKUP)
    .trim({ background: BLACK, threshold: 40 })
    .resize({ width: LW })
    .toBuffer();
  const { height: lh } = await sharp(lockup).metadata();
  const top = Math.round((H - lh) / 2) - 30;

  const overlay = Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
      <rect x="0" y="0" width="${W}" height="6" fill="${SIGNAL}"/>
      <text x="${W / 2}" y="${top + lh + 70}" text-anchor="middle"
            font-family="Consolas, 'DejaVu Sans Mono', monospace" font-size="30"
            letter-spacing="8" fill="${MUTED}">CREATE, PLAY, SLAY, ELATE</text>
    </svg>`);

  await sharp({ create: { width: W, height: H, channels: 4, background: BLACK } })
    .composite([
      { input: lockup, top, left: Math.round((W - LW) / 2) },
      { input: overlay, top: 0, left: 0 },
    ])
    .png({ compressionLevel: 9 })
    .toFile(`${OUT}/og.png`);
  console.log(`${OUT}/og.png`);
}

/*
 * One card per section, so a pasted /workshop link says WORKSHOP rather than
 * previewing as the home page. Written out here rather than imported from
 * src/config/site.ts, which is TypeScript that reads `import.meta.env` and
 * will not load under plain node. The summaries are that file's; the colour
 * is the section's accent from tokens.css. Change one there, change it here.
 */
const SECTIONS = [
  ['workshop', '02 / SECTION', 'WORKSHOP', 'Systems I design, build, and ship — and what each one taught me.', '#38bdf8'],
  ['builds', '03 / SECTION', 'BUILDS', 'Nub marks, spilled panel liner, and a growing suspicion that Bandai is overrated.', '#fbbf24'],
  ['games', '04 / SECTION', 'GAMES', '293 games, 98 platinums, and over 600 days I am not getting back.', '#a78bfa'],
  ['books', '05 / SECTION', 'BOOKS', "135 books, 18 of them are Murakami's.", '#34d399'],
  ['journeys', '06 / SECTION', 'JOURNEYS', 'Journeys through the world.', '#f472b6'],
  ['resume', 'KHANH NGUYEN TUAN', 'RESUME', 'Technical project manager and .NET engineer — fourteen years of teams, offshore centres and systems shipped.', '#38bdf8'],
];

const xml = (text) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/'/g, '&apos;');

/** Greedy wrap to `width` characters — mono, so characters are the measure. */
function wrap(text, width) {
  const lines = [];
  let line = '';
  for (const word of text.split(' ')) {
    if (line && (line + ' ' + word).length > width) {
      lines.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * A section's card: the lockup small in the corner, the section's name set
 * large, its summary in mono under a rule in the section's own accent.
 * Generic font stacks for the reason `og()` gives.
 */
async function sectionCard([slug, eyebrow, name, summary, accent]) {
  const W = 1200;
  const H = 630;
  const X = 80;
  const lockup = await sharp(LOCKUP)
    .trim({ background: BLACK, threshold: 40 })
    .resize({ width: 280 })
    .toBuffer();

  const lines = wrap(summary, 52).slice(0, 3);
  const summaryTop = 430;
  const overlay = Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
      <rect x="0" y="0" width="${W}" height="6" fill="${accent}"/>
      <text x="${X}" y="250" font-family="Consolas, 'DejaVu Sans Mono', monospace"
            font-size="26" letter-spacing="4" fill="${accent}">${xml(eyebrow)}</text>
      <text x="${X - 6}" y="370" font-family="'Segoe UI', 'Helvetica Neue', Arial, sans-serif"
            font-size="124" font-weight="700" letter-spacing="-2" fill="#e4e4e7">${xml(name)}</text>
      <rect x="${X}" y="395" width="120" height="4" fill="${accent}"/>
      ${lines
        .map(
          (line, i) =>
            `<text x="${X}" y="${summaryTop + 40 + i * 40}" font-family="Consolas, 'DejaVu Sans Mono', monospace" font-size="28" fill="${MUTED}">${xml(line)}</text>`,
        )
        .join('')}
    </svg>`);

  mkdirSync(`${OUT}/og`, { recursive: true });
  await sharp({ create: { width: W, height: H, channels: 4, background: BLACK } })
    .composite([
      { input: lockup, top: 70, left: X },
      { input: overlay, top: 0, left: 0 },
    ])
    .png({ compressionLevel: 9 })
    .toFile(`${OUT}/og/${slug}.png`);
  console.log(`${OUT}/og/${slug}.png`);
}

await icon(180, 'apple-touch-icon.png');
await icon(192, 'icon-192.png');
await icon(512, 'icon-512.png');
await icon(32, 'favicon-32.png', 0.9);
await og();
for (const section of SECTIONS) await sectionCard(section);
