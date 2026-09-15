# SHINIGAMAE.DEV — backend design

Last updated: 2026-09-14
Status: **not started.** Design only; no code exists yet.

`PLAN.md` decides *what* phase 2 is and *why*, and remains the decision
register — D1–D7, the risks, the phase order. **This file is the technical
design**: the storage boundary, the caching strategy, the schema, the API, and
the .NET and Azure specifics. Where the two disagree, this file is newer and
wins; §1 lists exactly what it overturns so nothing is reversed silently.

---

## 1. What changed since PLAN.md

Four constraints arrived on 2026-09-14 and three of them overrule a
recommendation in `PLAN.md` §3.

| # | PLAN.md said | Now | Consequence |
| --- | --- | --- | --- |
| D3 | Container Apps, min replicas 0 | **Azure App Service**, Linux, B1 | No scale-to-zero, so no cold start — risk 3 in `PLAN.md` §9 disappears. Costs ~$13/mo instead of ~$0. Buys a simpler deployment story and `Always On` |
| — | Discord sign-in only | **Discord and Google** | Two providers to implement, one session model. Google is OIDC proper, which is less code than Discord's plain OAuth2 |
| — | Admin is one Discord snowflake | **Discord `Shinigamae` + Google `shinigamae@gmail.com`** | Two identities map to the same admin. See §8.3 — an email is a weaker key than a subject id, and there is a bootstrap for that |
| — | Runtime unstated | **.NET 10** | `HybridCache`, built-in OpenAPI, minimal-API validation and the built-in rate limiter are all in-box. `dotnet --version` here is already 10.0.400 |

The fourth is not an overrule but the heart of this document: **an explicit
split between JSON and PostgreSQL by how often a thing changes.** `PLAN.md`
§2 sketched it as three tiers; §2 below makes it a rule you can apply to a
field without thinking.

---

## 2. The storage boundary

### 2.1 The rule

> **Postgres stores what changes between builds. JSON stores what a sync
> produces and what a person edits rarely enough that a git commit is the
> right ceremony.**
>
> Postgres holds **deltas and events, never copies.**

Three questions settle any field:

1. **Does a sync own it?** → JSON. A sync overwrites its files wholesale; a
   second copy in Postgres would be a copy the sync is actively trying to
   destroy.
2. **Does it change between deploys?** → Postgres.
3. **Did a visitor create it?** → Postgres, obviously.

### 2.2 Why deltas, not rows

The tempting design is to load all 469 entries into Postgres and let the site
read from the database. It is the wrong one here, for four reasons:

- **The syncs already own that data.** Five scripts write those files nightly
  from five external feeds. Putting the same fields in Postgres creates a
  second writer for every one of them and a reconciliation problem that has no
  good answer.
- **The edit rate is near zero.** 41 builds, 123 books, 293 games, 12 albums.
  The number that have ever been hand-corrected is in the low tens. Storing
  469 full rows to express ~30 edits is 94% duplication.
- **It breaks the property `PLAN.md` §2 calls load-bearing:** the site must
  build with the database switched off. Deltas preserve it — the baked JSON is
  complete on its own and a patch is an improvement, not a dependency.
- **Schema churn.** A new field in `content.config.ts` becomes an EF migration
  if rows are mirrored, and nothing at all if they are not.

So: a book's `title`, `author`, `pages`, `isbn`, `cover` and `averageRating`
live in `src/content/books/<slug>.json`, written by the Goodreads sync. The
moment you edit the title, a row appears in `content_overrides` holding
exactly `{"title": "…"}` — and nothing else. Read path is the merge that
already exists in every sync script:

```js
Object.assign(entry.data, overrides[slug] ?? {});
```

> **Amended, 2026-09-15.** The reasoning above still governs the *build*: the site
> reads JSON, an override is a delta, and the site builds with the database switched
> off. Nothing here has changed and `content_overrides` is untouched.
>
> What it did not anticipate is the cost of the property it was defending. Baking
> every record produces **6.5 MB of prerendered HTML across 400-odd pages** — one per
> game, one per book — and the only way to stop paying for that is for the site to
> fetch its content instead of baking it. That needs the corpus on the server first.
>
> So there is now a second table, `content_entries`, holding a mirror of all 494
> records, and `GET /api/content/{type}` reads it with each entry's overrides already
> merged in. It is a **mirror, not a move**: the syncs still own the JSON, the mirror
> drifts until the import is re-run, and which half owns a record after the site stops
> baking is deliberately still open.
>
> The four objections in this section were answered rather than overruled. The second
> writer problem is why mirror and delta are separate tables — an import overwrites its
> rows wholesale and cannot touch an edit. The 94%-duplication argument was about
> storing 469 rows *to express 30 edits*, which is not what the mirror is for. And the
> schema-churn objection is why `data` is `jsonb` rather than columns: a new field in
> `content.config.ts` is still no migration at all.
>
> See `shinigamae-api/README.md`, "Content — the mirror, and why it is not the delta".


This is what you asked for — "the names of them, review, rating, status may go
into Postgres" — with the duplication removed. Every field is *editable*; only
the edited ones are *stored*.

### 2.3 Where each collection lands

| Collection | JSON owns (synced, static) | Postgres owns (edited, live) |
| --- | --- | --- |
| `builds` (41) | `body`, `gallery`, `hero`, `video`, `sourceUrl`, `buildDate`, `manufacturer`, `tags`, `summary` | `grade`, `scale`, `series`, `notes`, `pros`, `cons`, `status`, `index` |
| `books` (123) | `author`, `cover`, `pages`, `published`, `averageRating`, `isbn`, `goodreadsUrl`, `shelves`, `addedOn`, `finishedOn` | `title`, `rating`, `thought`, `review`, `status`, `current` |
| `games` (293) | `platform`, `year`, `progress`, `trophies`, `platinum`, `playtimeHours`, `firstPlayedOn`, `lastPlayedOn`, `icon`, `art` | `rating`, `review`, `screenshots`, `playStatus`, `current`, `status` |
| `albums` (12) | `flickrId`, `flickrUrl`, `photos`, `photoCount`, `index` | `title`, `description` |
| `music` (1 snapshot) | the whole chart — it is replaced every sync | `hiddenTrackIds` (§2.5) |
| `projects`, `clients` | **everything.** Hand-written, no sync, changes a few times a year | nothing |
| home `currentStatus` | the baked fallback | `building`, `next_build` — the flagship live field |
| comments | — | everything |

`projects` and `clients` staying entirely in JSON is a deliberate application
of the rule rather than an oversight. They are hand-authored, but they change
on the order of *months*, and a client's engagement history is exactly the
kind of thing that should be reviewed in a diff before it goes live.

> **Amended again, 2026-09-15.** `projects` and `clients` are no longer JSON-only.
> They are editable from the site, through `PUT /api/content/{type}/{slug}`, and the
> database is now where they are written.
>
> The paragraph above is the argument that was overruled, and it was not a bad one:
> what is lost is exactly the diff. A client's engagement history now changes without
> anyone reviewing it beforehand. What stands in its place is `audit_log`, which
> records who, when, and the whole document before and after — a review after the
> fact rather than before it.
>
> Two fences came with the change. Only a collection whose source is `hand` can be
> written this way, so a PUT on `games` is refused rather than silently overwritten by
> the next import. And `id`, `logo` and `shot` are carried across an edit by the server
> rather than accepted from the body: the first is the identity, and the other two are
> build-time asset paths that `astro:assets` resizes at build time, which a string in a
> form cannot be.


The per-type **allowlist** in the right-hand column is not documentation — it
is the validation table the server enforces on `PUT /api/overrides` (§7.3).
Anything outside it is rejected, which is what stops a JSONB column from
quietly becoming schemaless in production.

### 2.4 The three read paths

| Path | Source | Cost |
| --- | --- | --- |
| Build time | JSON + `overrides:pull` writes Postgres down into `*-overrides.json` | 1 API call per build |
| Page load, baked | The HTML, already merged | **zero** |
| Page load, live | `GET /api/live` — edits made *since* the build, plus status | 1 request, usually a 304 |

The important row is the second. Because overrides are baked at build time,
**a page view costs no database query at all** for anything but comments. The
live layer exists only to close the gap between "you edited it" and "the next
deploy" — typically a handful of fields, often none.

### 2.5 Hiding a row from ON ROTATION

Recorded here because it is the case that motivated the split. Music played
for someone else on the account — a bedtime playlist on repeat — is still
listening, and Spotify counts it; playlist privacy hides the playlist, not the
plays. The exclusion is admin state, so it is Postgres:
`content_overrides('music', 'rotation')` holding `{"hiddenTrackIds": [...]}`.

`spotify-sync.mjs` reads it at sync time via `GET /api/overrides/music/rotation`,
over-fetches 50 from Spotify, filters, then cuts to `SPOTIFY_LIMIT` — **in
that order**, or hiding a row leaves an eleven-row section. If the API is
unreachable the sync proceeds unfiltered rather than failing: a chart with an
extra row beats no chart.

---

## 3. Topology

```
   browser
     │
     ├──── HTML, CSS, images ───────▶ Azure Static Web Apps   shinigamae.dev
     │                                 (free tier, static only)
     │
     └──── /api/* ──────────────────▶ App Service (Linux, B1)  api.shinigamae.dev
              credentials: include        .NET 10 minimal API
                                              │
                                   ┌──────────┼──────────┐
                                   ▼          ▼          ▼
                            PostgreSQL    Key Vault   Blob Storage
                            Flexible      secrets,    DataProtection
                            Server B1ms   admin ids   keys + backups
                                   ▲
                                   │  managed identity, no password
                                   │
   GitHub Actions ─── overrides:pull ──▶ api.shinigamae.dev  (build time)
```

One region for all of it — Southeast Asia. Cross-region chat between the API
and Postgres is latency paid on every request, forever.

---

## 4. Caching — how the DB stays quiet

The brief was "avoid too many unnecessary hits into SQL". The design gets
there in four layers, of which the first does the most work.

### 4.1 Layer 0 — bake it

Covered in §2.4. Most content never reaches the API at runtime because it is
already in the HTML. This is worth more than every cache below it combined.

### 4.2 Layer 1 — one live endpoint, version-stamped

Not `GET /api/overrides/{type}/{slug}` per entry. One document:

```http
GET /api/live
If-None-Match: "v1482"

304 Not Modified
```

```jsonc
// 200, when the version has moved
{
  "version": 1483,
  "status": { "building": "Personal website", "nextBuild": "Qubeley Mk. II" },
  "overrides": {
    "books": { "kafka-on-the-shore": { "rating": 5 } }
  }
}
```

`version` is a single monotonic counter bumped inside the transaction of every
admin write. It is the ETag. The rules that make this cheap:

- The API holds the current version **in memory**. An `If-None-Match` that
  matches is answered 304 **without touching Postgres** — the common case for
  every page view between edits.
- The payload for a given version is immutable, so `HybridCache` keys on
  `live:{version}` with no TTL guessing. A write bumps the version, which
  changes the key; the old entry ages out on its own. There is no explicit
  invalidation to get wrong.
- `overrides` carries only entries with `updated_at` **after the deployed
  build's timestamp** (`PUBLIC_BUILD_AT`, baked in). Right after a deploy it
  is empty. It grows by one entry per edit and resets to empty on the next
  build.

So the steady state is: one conditional request per page view, answered 304
from memory, zero SQL.

### 4.3 Layer 2 — HybridCache on everything else

.NET 10's `HybridCache` (L1 in-process; L2 optional and **not** configured —
see §4.5) with tagged entries:

| Data | Key | Invalidated by |
| --- | --- | --- |
| Live document | `live:{version}` | version bump (key change) |
| Comment thread | `comments:{type}:{slug}:{threadVersion}` | post / delete on that thread |
| Session lookup | `sess:{tokenHash}`, 60s TTL | logout deletes the row; 60s of staleness on a revoked session is acceptable for one admin and a few guests |

Comment threads get **their own per-thread version** rather than riding the
global one, so writing a comment does not invalidate the live document for
every reader.

### 4.4 Layer 3 — the database itself

For the requests that do reach it:

- EF Core 10, `AddDbContextPool`, `AsNoTracking()` on every read path.
- **Compiled queries** for the three hot ones: session-by-hash, thread-by-slug,
  overrides-since.
- One round trip per request. No lazy loading — it is off by default and stays
  off.
- The whole `content_overrides` table is a few hundred rows at most. There is
  no query here that should ever need a plan more complicated than an index
  seek.

### 4.5 The assumption this rests on

**In-memory caching is only coherent because there is exactly one instance.**
App Service B1 has no autoscale and one worker; that is what makes the
in-memory version counter correct.

If that ever changes — scale out, or a second instance during a deploy — the
counter goes stale on every instance but the writer, and readers serve
yesterday's edit. The fix, in increasing order of effort:

1. Re-read the version from Postgres when the cached entry is older than *n*
   seconds. One trivial query, bounded staleness, no new infrastructure.
2. Postgres `LISTEN`/`NOTIFY` on write, each instance bumping its own counter.
3. Redis as the `HybridCache` L2, which is what the abstraction is for.

Write it with (1) already in place — it is ten lines — and the others become
optional rather than urgent.

---

## 5. Data model

Broadly `PLAN.md` §7, with the changes the new constraints force. EF Core
migrations, checked in.

```sql
-- Identity is (provider, subject), never an email and never an app-local id.
users (
  id             bigserial primary key,
  provider       text not null,          -- 'discord' | 'google'
  subject        text not null,          -- Discord snowflake, or Google 'sub'
  display_name   text not null,          -- cached at login
  avatar_url     text,
  email          text,                   -- Google only, verified only; nullable
  first_seen_at  timestamptz not null,
  last_seen_at   timestamptz not null,
  banned_at      timestamptz,
  unique (provider, subject)
)

sessions (
  token_hash     bytea primary key,      -- SHA-256; the cookie holds the token
  user_id        bigint not null references users on delete cascade,
  created_at     timestamptz not null,
  expires_at     timestamptz not null,
  user_agent     text
)
-- index on (expires_at) for the sweeper

comments (
  id             bigserial primary key,
  content_type   text not null,          -- 'build'|'game'|'book'|'album'
  slug           text not null,          -- the Astro collection id
  user_id        bigint references users, -- null when anonymous
  display_name   text,                   -- anonymous only, capped
  body           text not null,          -- plain text, capped at 4000
  created_at     timestamptz not null,
  deleted_at     timestamptz,            -- soft, so a thread keeps its shape
  ip_hash        bytea                   -- salted HMAC; rate limiting only
)
-- index on (content_type, slug, created_at) where deleted_at is null

content_overrides (
  content_type   text not null,
  slug           text not null,
  patch          jsonb not null,         -- mirrors *-overrides.json exactly
  updated_at     timestamptz not null,
  updated_by     bigint references users,
  primary key (content_type, slug)
)
-- index on (updated_at) — drives the "since the build" query

site_status (
  id             int primary key default 1 check (id = 1),
  building       text not null,
  next_build     text not null,
  updated_at     timestamptz not null
)

-- The version counter of §4.2. One row, bumped in the same transaction as
-- every admin write, read once at startup and held in memory thereafter.
site_version (
  id             int primary key default 1 check (id = 1),
  version        bigint not null
)

audit_log (
  id             bigserial primary key,
  at             timestamptz not null,
  user_id        bigint references users,
  action         text not null,
  target         text,
  before         jsonb,
  after          jsonb
)
```

`audit_log` earns its place *because* there is one admin: when something
changes and you do not remember changing it, that table is the only way to
find out what happened.

---

## 6. API surface

```
GET    /api/health                      → 200, no auth, no DB round-trip

GET    /api/live                        → { version, status, overrides }  ETag
GET    /api/auth/{provider}/start       → 302; provider ∈ discord | google
GET    /api/auth/{provider}/callback    → 302 back, sets session cookie
POST   /api/auth/logout                 → 204
GET    /api/me                          → { name, avatar, isAdmin } | 401

GET    /api/comments?type=&slug=        → [{ id, name, isAdmin, body, createdAt }]
POST   /api/comments                    → 201
DELETE /api/comments/{id}               → admin, or the author's own → 204

GET    /api/overrides                   → { builds: {…}, games: {…}, … }   admin
GET    /api/overrides/{type}/{slug}     → { patch }
PUT    /api/overrides/{type}/{slug}     → admin, validated patch → 200
PUT    /api/status                      → admin → 200
```

Notes that matter:

- **`GET /api/overrides` returns exactly the shape of the override files**, so
  `npm run overrides:pull` is a write to disk and nothing more.
- `GET /api/status` from `PLAN.md` is gone: status ships inside `/api/live`,
  because a page that wants one wants the other and two requests for one
  paint is a waste.
- Every mutation requires the `X-Requested-With` header (§8.5).
- Errors are RFC 9457 `ProblemDetails`, via `AddProblemDetails()`.

---

## 7. Authorization

### 7.1 Two providers, one session

Both flows land in the same place: verify state → exchange code → read a
stable subject → upsert `users` → mint an opaque session → 302 back.

- **Discord** — plain OAuth2, scope **`identify` only**. Not `email`, not
  `guilds`. A consent screen asking for more makes guests think twice.
- **Google** — OIDC, scope `openid email profile`. Validate the ID token
  against Google's JWKS: `iss`, `aud`, `exp`, `nonce`. `Microsoft.IdentityModel`
  does this; do not hand-roll it.

PKCE and `state` on both, in a short-lived encrypted cookie. The `return`
parameter is **validated against an allowlist of the site's own paths** — an
open redirect here is the classic bug in this flow.

### 7.2 Sessions

Opaque 256-bit tokens, SHA-256 hashed in `sessions`. Not JWTs: one admin and a
handful of guests is not a scale problem, and revoking by deleting a row is
worth more than statelessness. 30-day expiry, sliding on use, swept nightly.

### 7.3 Who is admin

Admin is **configuration, not a database column** — a flag in a table you can
edit from the app you are building is a weaker fence than a constant you
deploy. From Key Vault:

```
Admin:Identities:0 = "discord:<snowflake>"
Admin:Identities:1 = "google:<sub>"
```

The bootstrap problem: a Google `sub` is not knowable in advance, and what you
have is `shinigamae@gmail.com`. So:

```
Admin:GoogleEmailBootstrap = "shinigamae@gmail.com"
```

On a Google login where `email` matches (case-insensitive) **and
`email_verified` is true** and no `google:` identity is pinned yet, the API
writes that `sub` into `Admin:Identities` in Key Vault, logs it to
`audit_log`, and never consults the email again. One login, then the strong
key forever.

Why not trust the email permanently: it is a mutable attribute of an account,
and `email_verified` is a claim about *Google's* verification, not a promise
the address will not move. Pinning the `sub` removes the question. Get the
Discord snowflake by hand and put it straight in — no bootstrap needed there.

Everything privileged checks `isAdmin` on the **request**, resolved from the
session's user, never from anything the client sent.

### 7.4 What a signed-in guest can do

Nothing yet. Comments are a later phase; until then the only reason to sign in
is to be the admin. Build the flow for both providers anyway — retrofitting a
second provider onto a session model built for one is the expensive version.

### 7.5 Cookies and CSRF

`PLAN.md` §5 stands and is the reason the domain comes first:

- Cookie `__Host-sess`: `HttpOnly; Secure; SameSite=Lax; Path=/`, no `Domain`.
  The `__Host-` prefix makes host-only non-negotiable at the browser level.
- On `shinigamae.dev` + `api.shinigamae.dev` the request is same-site (still
  cross-origin), so a Lax cookie is sent and nothing is being phased out. On
  `*.azurewebsites.net` it is a third-party cookie and will stop working.
- CORS: explicit origin allowlist (production plus `http://localhost:4321`),
  `AllowCredentials`. Never `*` — not even legal with credentials.
- CSRF: `SameSite=Lax` blocks a cross-site form post, and requiring
  `X-Requested-With` on mutations means a plain form cannot reach a write
  endpoint at all. Both, not either.
- **DataProtection keys to Blob Storage, encrypted with a Key Vault key.** App
  Service keeps them on local disk by default and loses them on restart —
  which silently invalidates every in-flight OAuth state cookie. This is a
  three-line fix that is maddening to diagnose later.

---

## 8. The .NET 10 application

### 8.1 Layout

```
api/
  Shinigamae.Api/
    Program.cs                  composition root, ~120 lines
    Endpoints/                  one static class per group, MapXxx()
    Domain/                     entities, the per-type field allowlist
    Data/  AppDbContext.cs, Migrations/, CompiledQueries.cs
    Auth/  DiscordFlow, GoogleFlow, SessionStore, AdminPolicy
    Caching/ SiteVersion.cs, LiveDocument.cs
  Shinigamae.Api.Tests/         xUnit + Testcontainers (real Postgres)
```

Minimal APIs, not MVC controllers. The surface is ~15 endpoints; a controller
per noun is ceremony this does not need.

### 8.2 What .NET 10 gives for free — use it

| Concern | Use | Not |
| --- | --- | --- |
| Caching | `HybridCache` | hand-rolled `IMemoryCache` wrappers |
| Validation | built-in minimal-API validation (`AddValidation`, `[ValidatableType]`) | FluentValidation as a first reach |
| Errors | `AddProblemDetails` + `IExceptionHandler` | try/catch in every handler |
| OpenAPI | built-in `AddOpenApi` / `MapOpenApi` | Swashbuckle |
| Rate limiting | `AddRateLimiter`, fixed window keyed on IP hash | a bespoke middleware |
| Responses | `TypedResults` | `Results.Ok(...)` untyped |
| Serialization | `System.Text.Json` source generator | reflection at runtime |
| Telemetry | OpenTelemetry → Application Insights | `ILogger` alone |

**ReadyToRun, not Native AOT.** AOT with EF Core and OAuth libraries is a
fight for a startup saving that `Always On` already makes irrelevant.

### 8.3 Endpoint conventions

- An endpoint filter `.RequireAdmin()` on the privileged group; nothing checks
  admin inline.
- An endpoint filter `.RequireCsrfHeader()` on every non-GET.
- Every admin write runs in **one transaction** that touches the target table,
  bumps `site_version`, and appends `audit_log`. Three statements, one
  round trip via a single `SaveChangesAsync`.
- Cancellation tokens threaded everywhere. A browser that navigates away
  should not keep a connection busy.

### 8.4 Testing

`Testcontainers.PostgreSql` against a real Postgres — the JSONB merge and the
partial index are exactly the things an in-memory provider gets wrong. Three
suites worth writing before the feature they cover:

1. **The allowlist**: every field in §2.3's right column accepted, a field
   outside it rejected with 400, for each of the four types.
2. **Version and cache**: a write bumps the version; a conditional GET with
   the old ETag gets 200 and with the new one gets 304; a 304 issues no query.
3. **Auth**: `state` mismatch rejected, `return` outside the allowlist
   rejected, a non-admin `PUT` gets 403, an expired session gets 401.

---

## 9. Azure

| Resource | SKU | Why |
| --- | --- | --- |
| App Service Plan | Linux **B1** | Your call over Container Apps. No scale-to-zero means no cold start; `Always On` keeps it warm. No deployment slots at this tier — that starts at S1 |
| App Service | .NET 10, HTTPS only, TLS 1.2+, HTTP/2 | Health check `/api/health` so a wedged instance is recycled |
| PostgreSQL | Flexible Server **B1ms**, Entra auth | The largest line item. Check the 12-month free offer for eligible subscriptions first |
| Key Vault | Standard | Admin identities, IP-hash salt, OAuth client secrets — referenced from app settings, never copied into them |
| Storage | Blob, LRS | DataProtection keys + nightly `pg_dump`. **The comments exist in exactly one place** |
| App Insights | — | Sampling on; a personal site does not need 100% |

Rules:

- **Managed identity for Postgres and Key Vault.** No password in a connection
  string. Npgsql takes a token provider for Entra auth.
- No public network access on Postgres; the App Service reaches it over a
  private endpoint or a firewall rule scoped to the outbound subnet.
- Migrations run as a **`dotnet ef migrations bundle`** in the deploy job,
  before the app swap — never `Database.Migrate()` at startup, which races
  itself the moment there are two instances and hides failures in a log
  nobody reads.
- A **cost alert** on the subscription. This is the first part of the project
  that can cost real money.

All pricing above is indicative — check it against current rates rather than
trusting this table.

---

## 10. Frontend work this implies

Mostly already written down as `PLAN.md` phase 0, unchanged:

1. **`src/lib/api.ts`** — the only thing in the project that calls `fetch`.
   Base URL from `PUBLIC_API_URL`, `credentials: 'include'`,
   `X-Requested-With` on mutations, a hard timeout, one place where "the API
   is unreachable" is handled.
2. **Empty `PUBLIC_API_URL` means "no backend"** — every island checks it and
   renders the baked value silently. That is the feature flag; there is no
   other one.
3. **`PUBLIC_BUILD_AT`** baked at build time, sent as the `since` for
   `/api/live`.
4. **One live island**, mounted once per page, that fetches `/api/live` after
   paint and patches the DOM where a value differs. Not one island per
   editable field — one request, one pass.
5. Extract `currentStatus` from `src/config/home.ts` into a component taking
   the two values as props, so the island has a seam to mount into.
6. Generate the TS client from the OpenAPI document the API already emits.

---

## 11. Milestones

Each one ships on its own and leaves the site working.

| # | Milestone | Done when |
| --- | --- | --- |
| M0 | Domain + SWA cutover (`PLAN.md` phase 1) | `shinigamae.dev` serves the site; no `/air-chrysalis` anywhere |
| M1 | API skeleton on App Service | `/api/health` answers over HTTPS on `api.shinigamae.dev`; CI deploys it |
| M2 | Postgres + schema + `/api/live` | Returns an empty override set and the baked status; 304s correctly |
| M3 | Live status, end to end | `PUT /api/status` from curl changes the homepage without a deploy |
| M4 | Auth, both providers | `/api/me` says `isAdmin` for you on Discord and Google, and 401 otherwise |
| M5 | Edit mode | The status panel and one entry type editable in the browser |
| M6 | `overrides:pull` + the sync filter | A build bakes DB edits; ON ROTATION hides a row |
| M7 | Comments | Later, deliberately. `PLAN.md` phase 3 stands as written |

M3 is the one to aim at. It is the smallest slice that proves the whole
architecture — write, version bump, cache invalidation, conditional GET,
island patch — on a field with no auth in the way.

---

## 12. Risks

Beyond `PLAN.md` §9, which still applies except for cold starts:

1. **The in-memory version counter assumes one instance.** §4.5. Ship
   mitigation (1) from the start.
2. **A slug rename orphans both comments and overrides.** `PLAN.md` §9.2
   names it for comments; `content_overrides` has the same exposure and no
   foreign key to notice. Before M5, make the syncs warn when they rename an
   entry that has a row in either table.
3. **The bootstrap window in §7.3.** Between deploying `GoogleEmailBootstrap`
   and your first Google login, anyone who controls that address could claim
   admin. The address is yours and the window is minutes, but do the first
   Google login immediately after deploying, and check `audit_log` says it was
   you.
4. **Two sources of truth.** Every live field has a baked value behind it and
   they will disagree. The rule: baked is the fallback, live wins on hydrate,
   `overrides:pull` makes them agree at the next build. Never write a page
   that reads only one of the two.
5. **B1 is a single point of failure with no slots.** A bad deploy is visible
   downtime rather than a failed swap. Mitigated by the API being non-critical
   — the site is static and renders fully without it.

---

## 13. Open questions

- **D4 stands** (`PLAN.md` §3): Flexible Server or Neon. §9 assumes Flexible
  Server; Neon changes only the connection setup and the bill.
- **Comment identity.** Signing in via Google exposes an email address to the
  API that Discord's `identify` scope does not. Storing it is optional — §5
  makes it nullable. Decide before M7 whether it is stored at all.
- **Does the admin UI need its own route?** Editing in place on the real page
  is better, but a `/admin` page for things with no natural home on the site
  (audit log, comment moderation) may earn its place by M7.
