/**
 * Shared Figma helpers for the drift report. No dependencies.
 */

export const FILE_KEY = 'bibI5631jjXvSKmKNcZqx4';

/** The Foundations frame — colour tokens, layout rules, type scale. */
export const FOUNDATIONS_NODE = '15:2';

/**
 * The design-system components, by Figma node id.
 * Keys are node ids so a changed node maps straight to its source file.
 */
export const COMPONENT_NODES = {
  '33:34': { name: 'Sidebar Item', source: '(unused — top-nav shell)' },
  '33:41': { name: 'Status Label', source: 'src/components/ui/StatusLabel.astro' },
  '33:42': { name: 'Page Header', source: 'src/components/ui/PageHeader.astro' },
  '33:46': { name: 'Section Header', source: 'src/components/ui/SectionHeader.astro' },
  '33:49': { name: 'Editorial Card', source: 'src/components/ui/EditorialCard.astro' },
  '33:54': { name: 'Filter Control', source: 'src/components/ui/FilterControl.astro' },
  '33:56': { name: 'Spec Row', source: 'src/components/ui/SpecRow.astro' },
  '33:84': { name: 'Sidebar', source: '(unused — top-nav shell)' },
  '33:99': { name: 'Top Bar', source: 'src/components/layout/TopBar.astro' },
  '33:103': { name: 'Mobile Navigation', source: 'src/components/layout/MobileNavigation.astro' },
};

/** Read FIGMA_TOKEN from the environment, falling back to a local .env. */
export function readToken() {
  if (!process.env.FIGMA_TOKEN) {
    try {
      process.loadEnvFile('.env');
    } catch {
      /* no .env — fall through to the error below */
    }
  }
  const token = process.env.FIGMA_TOKEN;
  if (!token) {
    throw new Error(
      'FIGMA_TOKEN is not set.\n' +
        '  Create a token at Figma › Settings › Security › Personal access tokens\n' +
        '  (scope: file_content:read), then either export FIGMA_TOKEN=... or put\n' +
        '  FIGMA_TOKEN=... in a .env file (already gitignored).',
    );
  }
  return token;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Longest single pause we will take when Figma asks us to slow down. */
const MAX_RATE_LIMIT_WAIT_S = 60;

/** An HTTP failure that retrying cannot fix (auth, exhausted rate limit). */
class FatalHttpError extends Error {}

/**
 * GET a Figma API path with retries.
 *
 * Retries exist because this network intermittently resets the connection
 * mid-handshake. Run node with --use-system-ca if the certificate chain
 * cannot be verified (a TLS-inspecting proxy will require it).
 */
export async function figmaGet(path, token, { transportTries = 6, rateLimitTries = 3 } = {}) {
  // Two separate budgets. A flaky connection must not consume the patience we
  // reserve for rate limiting, or a genuine 429 never gets reported as one.
  let transportLeft = transportTries;
  let rateLimitLeft = rateLimitTries;
  let sawRateLimit = false;
  let lastError;
  let round = 0;

  while (transportLeft > 0 && rateLimitLeft > 0) {
    round += 1;
    try {
      const res = await fetch(`https://api.figma.com/v1/${path}`, {
        headers: { 'X-Figma-Token': token },
      });

      // Auth problems will never succeed on retry.
      if (res.status === 401 || res.status === 403) {
        throw new FatalHttpError(
          `${res.status} from Figma — token is invalid, expired, or lacks file_content:read.`,
        );
      }

      // Rate limiting needs a real wait, not a connection-blip backoff.
      if (res.status === 429) {
        sawRateLimit = true;
        rateLimitLeft -= 1;
        if (rateLimitLeft === 0) break;
        const retryAfter = Number(res.headers.get('retry-after'));
        const waitSeconds =
          Number.isFinite(retryAfter) && retryAfter > 0
            ? Math.min(retryAfter, MAX_RATE_LIMIT_WAIT_S)
            : Math.min(20 * (rateLimitTries - rateLimitLeft), MAX_RATE_LIMIT_WAIT_S);
        process.stderr.write(
          `  rate limited (429), waiting ${waitSeconds}s — ${rateLimitLeft} attempt(s) left\n`,
        );
        await sleep(waitSeconds * 1000);
        continue;
      }

      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
      return await res.json();
    } catch (error) {
      if (error instanceof FatalHttpError) throw error;
      lastError = error;
      transportLeft -= 1;
      if (transportLeft > 0) await sleep(300 * round);
    }
  }

  // Rate limiting is the more useful diagnosis whenever we saw it at all —
  // a trailing connection reset is a symptom, not the cause.
  if (sawRateLimit) {
    throw new FatalHttpError(
      'Figma is rate limiting this token (429). Wait a few minutes and run it again — ' +
        'the report is read-only, so nothing was left half-applied.',
    );
  }
  const detail = lastError?.cause?.message ?? lastError?.message ?? 'unknown';
  throw new Error(`Figma request failed after ${transportTries} attempts: ${detail}`);
}

/** #RRGGBB from a Figma colour, uppercased. Alpha is appended when < 1. */
export function toHex(color) {
  if (!color) return null;
  const hex = ['r', 'g', 'b']
    .map((k) => Math.round(color[k] * 255).toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
  const alpha = color.a === undefined || color.a >= 1 ? '' : ` a${color.a.toFixed(2)}`;
  return `#${hex}${alpha}`;
}

/** First visible solid paint, as hex. */
export function firstSolid(paints) {
  const paint = (paints ?? []).find((p) => p.visible !== false && p.type === 'SOLID');
  return paint ? toHex(paint.color) : null;
}

/** Depth-first walk over a Figma node tree. */
export function* walk(node) {
  yield node;
  for (const child of node.children ?? []) yield* walk(child);
}

/**
 * Normalise one component node into a stable, diffable spec.
 * Only the properties we actually implement are captured — noise here
 * would produce drift reports nobody reads.
 */
export function specOf(node) {
  const box = node.absoluteBoundingBox;
  const spec = {
    name: node.name,
    type: node.type,
  };

  if (box) spec.size = `${Math.round(box.width)}x${Math.round(box.height)}`;

  if (node.layoutMode && node.layoutMode !== 'NONE') {
    spec.layout =
      `${node.layoutMode === 'HORIZONTAL' ? 'row' : 'col'}` +
      ` gap=${node.itemSpacing ?? 0}` +
      ` pad=${[node.paddingTop ?? 0, node.paddingRight ?? 0, node.paddingBottom ?? 0, node.paddingLeft ?? 0].join('/')}` +
      (node.primaryAxisAlignItems ? ` main=${node.primaryAxisAlignItems}` : '') +
      (node.counterAxisAlignItems ? ` cross=${node.counterAxisAlignItems}` : '');
  }

  const fill = firstSolid(node.fills);
  if (fill) spec.fill = fill;

  const stroke = firstSolid(node.strokes);
  if (stroke) spec.stroke = `${stroke} w=${node.strokeWeight ?? 1}`;

  if (node.cornerRadius !== undefined) spec.radius = node.cornerRadius;

  if (node.type === 'TEXT') {
    const style = node.style ?? {};
    spec.copy = (node.characters ?? '').replace(/\n/g, ' / ');
    spec.font =
      `${style.fontFamily} ${style.fontWeight} ${style.fontSize}` +
      `/${style.lineHeightPx ? Math.round(style.lineHeightPx) : '?'}` +
      ` ls=${style.letterSpacing ? Number(style.letterSpacing.toFixed(2)) : 0}`;
  }

  const children = (node.children ?? []).map(specOf);
  if (children.length) spec.children = children;

  return spec;
}
