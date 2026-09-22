/**
 * Writes `dist/staticwebapp.config.json` — the file Azure Static Web Apps reads to
 * decide what headers every response carries and how long a browser may keep it.
 *
 * Generated rather than committed, for one reason: the Content-Security-Policy has to
 * name the hash of every inline <script> in the build, and this project has one — the
 * theme bootstrap in AppShell, which is inline precisely so it can run before paint.
 * A hash written by hand is a hash that is correct until somebody adjusts a comment
 * inside that script, and then the site loads with its theme switch silently dead.
 * Reading the hashes out of the built HTML means the policy cannot drift from what it
 * is a policy about.
 *
 * Run as part of `npm run build`, so a deploy cannot ship the site without it.
 *
 * ---
 *
 * This file is Static Web Apps only. GitHub Pages serves no such configuration and
 * cannot be given headers at all — which is one more reason it is the mirror being
 * retired rather than the host. Building it there is harmless: nothing reads it.
 */

import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const DIST = 'dist';

/** '' on Static Web Apps, '/air-chrysalis' on Pages. Routes below are built from it. */
const BASE = (process.env.SITE_BASE ?? '/air-chrysalis').replace(/\/+$/, '');

/** The API this build talks to, if any. Empty means the site makes no cross-origin call. */
const API = (process.env.PUBLIC_API_URL ?? '').replace(/\/+$/, '');

/*
 * Where the remote pictures come from. Every one of these is a host the synced content
 * already points at — PlayStation art, Goodreads covers, Flickr photographs, Blogger's
 * image CDN, YouTube thumbnails, Spotify cover art — plus Discord's avatar CDN, which
 * only appears once somebody signs in.
 *
 * Listed rather than `https:`, because the point of the policy is that a field somebody
 * edits cannot turn into a request to somewhere new.
 */
const IMAGE_HOSTS = [
  'https://image.api.playstation.com',
  'https://psnobj.prod.dl.playstation.net',
  'https://i.gr-assets.com',
  'https://images-na.ssl-images-amazon.com',
  'https://live.staticflickr.com',
  'https://blogger.googleusercontent.com',
  'https://img.youtube.com',
  'https://i.ytimg.com',
  'https://i.scdn.co',
  'https://image-cdn-ak.spotifycdn.com',
  'https://image-cdn-fa.spotifycdn.com',
  'https://mosaic.scdn.co',
  'https://cdn.discordapp.com',
];

/** The two things the site embeds: a trailer and a playlist. */
const FRAME_HOSTS = [
  'https://www.youtube-nocookie.com',
  'https://www.youtube.com',
  'https://open.spotify.com',
];

/** Every .html under dist/, however deep. */
function pages(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...pages(path));
    else if (entry.name.endsWith('.html')) out.push(path);
  }
  return out;
}

/**
 * The CSP hash of every inline script in the build.
 *
 * A <script> with a `src` is covered by 'self' and is deliberately not hashed — the
 * negative lookahead is what tells the two apart. The hash is over the element's exact
 * text content, which is what a browser hashes too, so nothing may be normalised here.
 */
function inlineScriptHashes(files) {
  const hashes = new Set();
  for (const file of files) {
    const html = readFileSync(file, 'utf8');
    for (const [, body] of html.matchAll(/<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/g)) {
      hashes.add(`'sha256-${createHash('sha256').update(body).digest('base64')}'`);
    }
  }
  return [...hashes].sort();
}

const files = pages(DIST);
const scripts = inlineScriptHashes(files);

/*
 * style-src keeps 'unsafe-inline', and only style-src.
 *
 * Several components set a `style` attribute to hand CSS a custom property — a header's
 * min-height, a gradient's two stops — and a style *attribute* cannot be hashed. The
 * alternative is a stylesheet rule per instance, which is a real cost for a directive
 * whose worst case is somebody restyling a page they have already had to inject content
 * into. script-src, where it would actually matter, names hashes and nothing else.
 */
const csp = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  `script-src 'self' ${scripts.join(' ')}`.trim(),
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: ${IMAGE_HOSTS.join(' ')}`,
  "font-src 'self'",
  `connect-src 'self'${API ? ` ${API}` : ''}`,
  `frame-src ${FRAME_HOSTS.join(' ')}`,
  "media-src 'self'",
  "worker-src 'self'",
  "manifest-src 'self'",
  'upgrade-insecure-requests',
].join('; ');

const immutable = { 'Cache-Control': 'public, max-age=31536000, immutable' };

const config = {
  // Astro emits directory-style routes (/games/index.html), which is what this matches.
  trailingSlash: 'auto',

  globalHeaders: {
    'Content-Security-Policy': csp,
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy':
      'accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()',
    // Two years, and subdomains, because there is nothing on this hostname that is ever
    // meant to be reachable over http. `preload` is deliberately absent: it is a
    // submission to a list that is painful to leave, and this domain is not settled.
    'Strict-Transport-Security': 'max-age=63072000; includeSubDomains',
    'X-Frame-Options': 'DENY',
    'Cross-Origin-Opener-Policy': 'same-origin',
    // The archive stays out of search results until it is meant to be found — the same
    // decision as the robots meta tag in AppShell, said in a header so it also covers
    // the RSS feed and anything else that is not an HTML page.
    'X-Robots-Tag': 'noindex, nofollow',
  },

  routes: [
    /*
     * Astro fingerprints everything under _astro/ — the filename contains a hash of the
     * contents, so a changed file is a changed URL and a cached one can never be stale.
     * That is the case `immutable` exists for: a year, and no revalidation at all.
     *
     * The fonts are in here too. @fontsource is imported through CSS, so Vite emits the
     * woff2 files alongside the stylesheet with the same fingerprinting.
     */
    { route: `${BASE}/_astro/*`, headers: immutable },

    // Not fingerprinted — the name is fixed and referenced from every page — so this one
    // revalidates weekly instead.
    { route: `${BASE}/favicon.svg`, headers: { 'Cache-Control': 'public, max-age=604800' } },

    // The feed is generated per build and read by aggregators on their own schedule.
    { route: `${BASE}/rss.xml`, headers: { 'Cache-Control': 'public, max-age=3600' } },

    /*
     * The HTML itself: cacheable, but revalidated every time.
     *
     * It has to be. A page carries the build stamp the live layer sends as `since`, so a
     * browser holding yesterday's HTML would ask the API what changed since yesterday's
     * build and be told about edits it has already got baked in. `must-revalidate` with a
     * zero lifetime means the copy is kept and confirmed — a 304 and no body — rather
     * than downloaded again.
     */
    { route: '/*', headers: { 'Cache-Control': 'public, max-age=0, must-revalidate' } },
  ],

  /*
   * The error pages Static Web Apps can serve itself.
   *
   * Four, and only four: SWA overrides 400, 401, 403 and 404, and nothing in the
   * 5xx range. The site builds 429, 500, 502 and 503 as well — see
   * `src/config/errors.ts` — but those are destinations to send a reader to, not
   * responses this host can produce. They live at /error/<code>/ and are reachable
   * by anything that needs to hand somebody a page for one.
   *
   * Without the 404 line, Static Web Apps answers an unknown path with index.html
   * and a **200** — every typo becomes a copy of the homepage that a crawler will
   * happily index as a separate page. The rest are here so that the day a route is
   * given a role, the refusal already looks like the site.
   *
   * 404 is `/404.html` and the others are `/error/<code>/index.html` because Astro
   * special-cases `src/pages/404.astro` and builds it flat. That asymmetry is in
   * the built output, so it has to be in the paths here.
   */
  responseOverrides: {
    400: { rewrite: `${BASE}/error/400/index.html`, statusCode: 400 },
    401: { rewrite: `${BASE}/error/401/index.html`, statusCode: 401 },
    403: { rewrite: `${BASE}/error/403/index.html`, statusCode: 403 },
    404: { rewrite: `${BASE}/404.html`, statusCode: 404 },
  },

  navigationFallback: {
    rewrite: `${BASE}/404.html`,
    exclude: ['/_astro/*', '/*.svg', '/*.xml', '/*.txt', '/*.json', '/*.png', '/*.jpg', '/*.webp'],
  },

  mimeTypes: {
    '.json': 'application/json',
    '.svg': 'image/svg+xml',
    '.webmanifest': 'application/manifest+json',
    '.xml': 'application/xml',
  },
};

writeFileSync(join(DIST, 'staticwebapp.config.json'), `${JSON.stringify(config, null, 2)}\n`);

console.log(
  `staticwebapp.config.json: ${scripts.length} inline script hash(es) over ${files.length} pages` +
    `${API ? `, connect-src ${API}` : ', no API in this build'}`,
);
