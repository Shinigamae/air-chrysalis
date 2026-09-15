/**
 * The only thing in this project that calls `fetch` (BACKEND.md §10.1).
 *
 * Everything the admin UI does to the server goes through here, so there is one place
 * that knows the base URL, one place that attaches the bearer token, one place that
 * puts `X-Requested-With` on a mutation, and one place where "the API is unreachable"
 * is turned into something a component can render.
 *
 * ---
 *
 * **The client is not the fence.** Nothing in this file, and nothing that reads
 * `isAdmin` off it, grants permission to anything. Every mutating endpoint on the API
 * re-reads the admin allowlist from configuration on the request itself, so a visitor
 * who flips the flag in devtools gets a UI full of controls and a 403 from each one.
 * `isAdmin` here decides whether it is worth *showing* a control, which is a question
 * about clutter, not about authorisation.
 *
 * ---
 *
 * An empty `PUBLIC_API_URL` means "no backend" (§10.2). That is the feature flag and
 * there is no other one: with it unset the admin bar never mounts, no request is ever
 * made, and every page renders exactly the values the build baked in.
 */

/** '' when unset. Trailing slashes trimmed so paths can be joined naively. */
const BASE = (import.meta.env.PUBLIC_API_URL ?? '').replace(/\/+$/, '');

/** Whether this build has a backend at all. Read it before mounting anything. */
export const hasBackend = BASE !== '';

/**
 * Long enough for a cold start, short enough that a dead API does not leave a control
 * spinning forever. App Service F1 sleeps after ~20 minutes idle, and the first request
 * after that pays for the whole process starting — which is exactly the request an
 * admin makes when they open the site to edit something.
 */
const TIMEOUT_MS = 15_000;

const TOKEN_KEY = 'shinigamae.token';

/** What `/api/me` answers with. */
export interface Me {
  name: string;
  avatar?: string;
  isAdmin: boolean;
  provider: string;
}

/** The site's live fields, as `/api/status` holds them. */
export interface SiteStatus {
  building: string;
  nextBuild: string;
}

/**
 * A failed call, with enough on it to render a sentence rather than "Error".
 * `status` is 0 when the request never reached the server at all.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly detail: string;

  constructor(status: number, title: string, detail = '') {
    super(detail ? `${title} ${detail}` : title);
    this.name = 'ApiError';
    this.status = status;
    this.detail = detail;
  }

  /** True when signing in again is the thing that would fix it. */
  get isAuth(): boolean {
    return this.status === 401 || this.status === 403;
  }
}

/* --- the token ------------------------------------------------------------ */

/*
 * localStorage, not a cookie. The API authenticates with a bearer header precisely so
 * that nothing has to work cross-origin with credentials, and a token the script has to
 * read cannot live in an HttpOnly cookie anyway. It expires in an hour and renews for
 * up to thirty days; the worst case for a stolen one is bounded by that, and admin is
 * re-read from configuration on every request rather than carried inside it.
 *
 * Every access is wrapped: Safari in private mode throws on access rather than
 * returning null, and an admin bar that crashes the page is worse than one that does
 * not appear.
 */

export function readToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function writeToken(token: string | null): void {
  try {
    if (token === null) localStorage.removeItem(TOKEN_KEY);
    else localStorage.setItem(TOKEN_KEY, token);
  } catch {
    /* Private mode. The session lasts as long as the tab, which is enough to edit. */
  }
}

/* --- transport ------------------------------------------------------------ */

type Method = 'GET' | 'POST' | 'PUT' | 'DELETE';

async function request<T>(method: Method, path: string, body?: unknown): Promise<T> {
  if (!hasBackend) {
    throw new ApiError(0, 'No backend configured.', 'PUBLIC_API_URL is empty in this build.');
  }

  const headers: Record<string, string> = {};
  const token = readToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  if (method !== 'GET') {
    // Required on every mutation by the API. A cross-site form cannot set a header, so
    // this is what makes a form post structurally incapable of reaching a write.
    headers['X-Requested-With'] = 'shinigamae-edit';
  }

  if (body !== undefined) headers['Content-Type'] = 'application/json';

  let response: Response;
  try {
    response = await fetch(`${BASE}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (cause) {
    // Offline, CORS, DNS, or the timeout above. None of them are distinguishable from
    // script, and all of them mean the same thing to whoever is looking at the page.
    const timedOut = cause instanceof DOMException && cause.name === 'TimeoutError';
    throw new ApiError(
      0,
      timedOut ? 'The API did not answer in time.' : 'Could not reach the API.',
      timedOut ? 'It may be starting up — try again in a moment.' : '',
    );
  }

  if (response.status === 204) return undefined as T;

  if (!response.ok) {
    // RFC 9457 ProblemDetails, which is what the API answers every error with. Parsed
    // defensively all the same: a proxy or a cold start can return HTML instead.
    let title = `Request failed (${response.status}).`;
    let detail = '';
    try {
      const problem = await response.json();
      if (typeof problem?.title === 'string') title = problem.title;
      if (typeof problem?.detail === 'string') detail = problem.detail;
    } catch {
      /* Not JSON. The status line is all there is to say. */
    }
    throw new ApiError(response.status, title, detail);
  }

  const text = await response.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

/* --- identity ------------------------------------------------------------- */

/**
 * Who is signed in, or null. A 401 is the ordinary answer for a visitor and is not an
 * error — only a real failure throws.
 */
export async function getMe(): Promise<Me | null> {
  if (!readToken()) return null;

  try {
    return await request<Me>('GET', '/api/me');
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      // Expired or revoked. Drop it rather than retry it on every page load.
      writeToken(null);
      return null;
    }
    throw error;
  }
}

/**
 * The local-only sign-in, until the OAuth redirect flow is wired.
 *
 * `POST /api/auth/dev` is refused outright in Production and gated behind
 * `Auth:DevAuthEnabled` everywhere else, so this cannot become the real door by
 * accident. When Discord and Google are wired this is replaced by the exchange in
 * BACKEND.md §7 — the site sends the browser to the provider, gets a code back, and
 * posts it to `/api/auth/{provider}/exchange`. Everything downstream of the token is
 * already written and does not change.
 */
export async function signInDev(): Promise<Me> {
  const auth = await request<{ token: string; user: Me }>('POST', '/api/auth/dev');
  writeToken(auth.token);
  return auth.user;
}

export function signOut(): void {
  writeToken(null);
}

/* --- overrides ------------------------------------------------------------ */

/**
 * `PUT /api/overrides` **replaces** an entry's whole patch, so writing one field means
 * reading the others first. Doing that in the caller would be four chances to drop
 * someone's review while saving a rating; doing it here means there is one.
 *
 * Passing `null`/`undefined` for a field removes it from the patch — which is how you
 * say "stop overriding this" rather than "override it with nothing". An empty patch
 * clears the row entirely, and the API deletes it rather than storing `{}`.
 */
export async function patchOverride(
  type: string,
  slug: string,
  changes: Record<string, unknown>,
): Promise<number> {
  const current = await request<{ patch: Record<string, unknown> }>(
    'GET',
    `/api/overrides/${encodeURIComponent(type)}/${encodeURIComponent(slug)}`,
  );

  const merged: Record<string, unknown> = { ...(current.patch ?? {}) };
  for (const [key, value] of Object.entries(changes)) {
    if (value === null || value === undefined) delete merged[key];
    else merged[key] = value;
  }

  const result = await request<{ version: number }>(
    'PUT',
    `/api/overrides/${encodeURIComponent(type)}/${encodeURIComponent(slug)}`,
    merged,
  );
  return result.version;
}

/** The current patch for one entry, as the override files spell it. */
export async function getOverride(type: string, slug: string): Promise<Record<string, unknown>> {
  const current = await request<{ patch: Record<string, unknown> }>(
    'GET',
    `/api/overrides/${encodeURIComponent(type)}/${encodeURIComponent(slug)}`,
  );
  return current.patch ?? {};
}

/* --- ON ROTATION ---------------------------------------------------------- */

/** The ids hidden from the chart. `music`'s only overridable field (BACKEND.md §2.5). */
export async function getHiddenTracks(): Promise<string[]> {
  const patch = await getOverride('music', 'rotation');
  const hidden = patch.hiddenTrackIds;
  return Array.isArray(hidden) ? hidden.filter((id): id is string => typeof id === 'string') : [];
}

/**
 * Hide or unhide one track.
 *
 * The chart does not re-cut here, and cannot: `spotify-sync.mjs` over-fetches 50 from
 * Spotify, filters, *then* cuts to the limit, so the row that replaces a hidden one is
 * not on this page to promote. The next sync fills the gap. Until then the section is
 * one row shorter, which is the honest thing for it to be.
 */
export async function setTrackHidden(id: string, hidden: boolean): Promise<number> {
  const current = await getHiddenTracks();
  const next = hidden
    ? current.includes(id)
      ? current
      : [...current, id]
    : current.filter((existing) => existing !== id);

  // Unhiding the last track sends `null`, not `[]`. Both would render identically, but
  // `{"hiddenTrackIds": []}` is a stored row that says nothing has been overridden —
  // exactly the duplication a delta exists to avoid — and `/api/live` would carry it to
  // every page view from then on. `null` removes the field, which empties the patch,
  // which makes the API drop the row.
  return patchOverride('music', 'rotation', { hiddenTrackIds: next.length > 0 ? next : null });
}

/* --- the live status ------------------------------------------------------ */

export async function putStatus(status: SiteStatus): Promise<number> {
  const result = await request<{ version: number }>('PUT', '/api/status', status);
  return result.version;
}

/* --- hand-written records ------------------------------------------------- */

/**
 * Create or replace one `projects` / `clients` record.
 *
 * Only those two are writable — everything else has a sync behind it, and the API
 * refuses a PUT here on any of them. Fields the edit may not touch (`id`, and a
 * client's `logo`/`shot`, which are build-time asset paths) are carried by the server
 * off the stored row, so they are deliberately absent from `record`.
 */
export async function putContent(
  type: 'projects' | 'clients',
  slug: string,
  record: Record<string, unknown>,
): Promise<{ version: number; slug: string }> {
  return request<{ version: number; slug: string }>(
    'PUT',
    `/api/content/${type}/${encodeURIComponent(slug)}`,
    record,
  );
}

export async function deleteContent(type: 'projects' | 'clients', slug: string): Promise<void> {
  await request<unknown>('DELETE', `/api/content/${type}/${encodeURIComponent(slug)}`);
}

/**
 * A slug from a title, matching the shape the API validates against and the one Astro's
 * loaders already produce. Generated on the client only so the field can be *shown*
 * before saving; the server checks it again regardless.
 */
export function slugify(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 200)
    .replace(/-+$/g, '');
}
