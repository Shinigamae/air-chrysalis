/**
 * The live layer (BACKEND.md §4.2, §10.4).
 *
 * The site is baked. Every page is generated at deploy time with the values the
 * content files held then, which makes a page view cost no database query at all.
 * The gap that leaves is between an edit and the next deploy: the admin changes a
 * rating, and the HTML keeps saying the old one until something rebuilds.
 *
 * This closes that gap, and only that gap. One request per page, after paint,
 * asking "what changed since this HTML was made" — and the answer right after a
 * deploy is nothing, because `since` is the build stamp. No spinner, no skeleton,
 * no layout shift: the baked value is already correct and on screen, and this
 * replaces it only where the server disagrees.
 *
 * Not a React island, unlike edit mode. There is no state to keep — one fetch, one
 * pass over the document — and the site already made this call once for the
 * collection filters. React would be 40 KB to set `textContent`.
 *
 * ---
 *
 * The markup contract is two attributes:
 *
 *   data-live-entry="games/elden-ring"   on anything that renders one entry
 *   data-edit-field="rating"             on the node holding one of its fields
 *
 * plus `data-status-field` for the homepage's live status, which is not an entry.
 * Adding a field to the live layer is adding an attribute; nothing here needs to
 * know which page it is on.
 */

const API = (import.meta.env.PUBLIC_API_URL ?? '').replace(/\/+$/, '');
const BUILT_AT = import.meta.env.PUBLIC_BUILD_AT ?? '';

interface LiveDocument {
  version: number;
  status?: { building?: string; nextBuild?: string };
  overrides?: Record<string, Record<string, Record<string, unknown>>>;
}

/**
 * How a stored value becomes the string the page shows.
 *
 * The API holds `rating: 9`; the page reads "9 / 10". Patching the raw value would
 * quietly strip the unit off a number that has one. Anything without an entry here
 * is rendered as plain text, which is right for a review or a title.
 */
const FORMAT: Record<string, (value: unknown) => string> = {
  rating: (value) => (value === null || value === undefined ? '—' : `${value} / 10`),
  'play-status': (value) => String(value).replace('-', ' ').toUpperCase(),
  playStatus: (value) => String(value).replace('-', ' ').toUpperCase(),
  status: (value) => String(value).toUpperCase(),
};

/** The field names the page spells differently from the API. */
const ALIAS: Record<string, string> = {
  playStatus: 'play-status',
};

function render(field: string, value: unknown): string {
  const format = FORMAT[field];
  return format ? format(value) : value === null || value === undefined ? '' : String(value);
}

/** Writes only when it differs, so an unchanged page is never touched. */
function put(node: Element, text: string): void {
  if (node.textContent?.trim() === text.trim()) return;
  node.textContent = text;
}

export async function syncLive(): Promise<void> {
  if (!API) return;

  let live: LiveDocument;
  try {
    // No cache mode and no ETag handling here: the API answers `no-cache` with an
    // ETag, so the browser revalidates on its own and a 304 costs one round trip
    // and no body. Re-implementing that in script would be slower and wronger.
    const response = await fetch(`${API}/api/live?since=${encodeURIComponent(BUILT_AT)}`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return;
    live = (await response.json()) as LiveDocument;
  } catch {
    // Unreachable, slow, or asleep. The baked page is already correct as of the last
    // deploy, so there is nothing to report and nothing to degrade to — this is the
    // one place where doing nothing is the whole error handler.
    return;
  }

  if (live.status) {
    for (const [key, field] of [
      ['building', 'building'],
      ['nextBuild', 'next-build'],
    ] as const) {
      const value = live.status[key];
      if (typeof value !== 'string') continue;
      document
        .querySelectorAll(`[data-status-field="${field}"]`)
        .forEach((node) => put(node, value));
    }
  }

  const overrides = live.overrides;
  if (!overrides) return;

  document.querySelectorAll<HTMLElement>('[data-live-entry]').forEach((root) => {
    const [type, ...rest] = (root.dataset.liveEntry ?? '').split('/');
    const slug = rest.join('/');
    const patch = overrides[type]?.[slug];
    if (!patch) return;

    for (const [field, value] of Object.entries(patch)) {
      const selector = ALIAS[field] ?? field;
      root
        .querySelectorAll(`[data-edit-field="${selector}"]`)
        .forEach((node) => put(node, render(selector, value)));
    }
  });
}
