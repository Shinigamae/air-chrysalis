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

await icon(180, 'apple-touch-icon.png');
await icon(192, 'icon-192.png');
await icon(512, 'icon-512.png');
await icon(32, 'favicon-32.png', 0.9);
await og();
