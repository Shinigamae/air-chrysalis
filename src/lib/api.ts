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
 * The local stand-in for a provider, offered on localhost only.
 *
 * Discord is the real door — see `startDiscordLogin` below. This exists because a
 * redirect flow needs a redirect URI registered against a hostname, and `localhost`
 * changes port often enough that keeping one registered is a nuisance. It is not a
 * second way in: `POST /api/auth/dev` is refused outright in Production and gated
 * behind `Auth:DevAuthEnabled` everywhere else.
 */
export async function signInDev(): Promise<Me> {
  const auth = await request<{ token: string; user: Me }>('POST', '/api/auth/dev');
  writeToken(auth.token);
  return auth.user;
}

/*
 * Discord, the real door (BACKEND.md §7).
 *
 * The redirect URI is registered against the **site**, not the API: the browser
 * comes back *here* with the code, and this posts it to the API, which does the
 * exchange server-side so the client secret never reaches a browser.
 *
 * `state` is generated here and kept in sessionStorage. It is the whole CSRF story
 * for the login: a code delivered with a state this tab did not generate is a code
 * someone else asked for, and it is dropped.
 */

const STATE_KEY = 'shinigamae.oauth-state';

/** The client id is public by design — it travels in the authorize URL. */
const DISCORD_CLIENT_ID = import.meta.env.PUBLIC_DISCORD_CLIENT_ID ?? '';

export const canSignIn = hasBackend && DISCORD_CLIENT_ID !== '';

/**
 * Whether the local stand-in above is worth offering.
 *
 * A function rather than a constant: it reads the hostname, and every module in
 * this file is evaluated during the static build too, where there is no window.
 *
 * The endpoint behind it is refused outright in Production by the API, so this is
 * not the fence — it only keeps a door off a page where it does not open.
 */
export function canUseDevSignIn(): boolean {
  if (!hasBackend || typeof window === 'undefined') return false;
  const { hostname } = window.location;
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
}

/** Where the provider sends the browser back. Must match what is registered. */
function redirectUri(): string {
  // Origin plus the site's base path, with no query or hash: Discord compares this
  // string exactly, and a trailing ?code= from a previous attempt would break it.
  return `${window.location.origin}${import.meta.env.BASE_URL}`.replace(/\/+$/, '/');
}

export function startDiscordLogin(): void {
  const state = crypto.randomUUID();
  try {
    sessionStorage.setItem(STATE_KEY, state);
  } catch {
    /* Private mode. The exchange below will refuse, which is the safe direction. */
  }

  const url = new URL('https://discord.com/api/oauth2/authorize');
  url.searchParams.set('client_id', DISCORD_CLIENT_ID);
  url.searchParams.set('redirect_uri', redirectUri());
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'identify');
  url.searchParams.set('state', state);
  window.location.assign(url.toString());
}

/**
 * Completes a login if this page load is the one the provider redirected to.
 * Returns null when there is no code in the URL, which is every ordinary page view.
 */
export async function completeLoginFromUrl(): Promise<Me | null> {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  const state = params.get('state');
  if (!code || !state) return null;

  let expected: string | null = null;
  try {
    expected = sessionStorage.getItem(STATE_KEY);
    sessionStorage.removeItem(STATE_KEY);
  } catch {
    /* ignored — the mismatch below is then the outcome */
  }

  // Strip the code from the address bar either way. Leaving it there means a
  // refresh retries a code the provider has already spent, and it puts a
  // single-use credential in the history and in any copied link.
  const clean = window.location.pathname + window.location.hash;
  window.history.replaceState(null, '', clean);

  if (!expected || expected !== state) {
    throw new ApiError(0, 'Login could not be verified.', 'Start again from this tab.');
  }

  const auth = await request<{ token: string; user: Me }>('POST', '/api/auth/discord/exchange', {
    code,
    redirectUri: redirectUri(),
  });
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
