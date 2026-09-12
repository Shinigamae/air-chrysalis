# SHINIGAMAE.DEV — Phase 2: backend, accounts, comments, editing

Last updated: 2026-09-12
Status: **not started.** Backend expected ~2026-09-22 to 2026-09-26.

Companion to `DEPLOY.md` (how it ships today) and `STATUS.md` (what is built).
This file is the plan for the next step: a real .NET API, a PostgreSQL
database, Discord sign-in, guest comments, and an admin edit mode — hosted on
Azure Static Web Apps rather than GitHub Pages.

Nothing here is built yet. It is written down now so the decisions are made
once, in the open, rather than improvised against a deadline.

---

## 1. What this adds

| Capability | Who | Where it lands |
| --- | --- | --- |
| Discord sign-in | One admin (you), and any guest who wants a name | Header, beside the nav |
| Comments | Guests, signed in or anonymous | Every detail page |
| Edit mode | Admin only | Home status panel; build, game and book entries |
| Live status | Everyone, no sign-in | `CURRENT STATUS` on the homepage |

The flagship editable field already exists as a constant:
`currentStatus.building` / `currentStatus.nextBuild` in `src/config/home.ts`
are hard-coded to "Personal website" and "Qubeley Mk. II". Making those two
strings editable from the browser, without a deploy, is the smallest
end-to-end slice of this whole plan and the right thing to build first.

---

## 2. The shape of it

**The static build stays canonical.** This is the load-bearing decision and
everything else follows from it. 475 pages are generated at build time from
committed JSON, and that does not change: the API is a *layer*, not a
replacement. Astro stays `output: 'static'`, which also keeps the SWA free
tier viable — no SSR adapter, no server runtime, no cold start on a page view.

Content therefore lives in three tiers:

| Tier | Owner | Read at | Example |
| --- | --- | --- | --- |
| **Synced** | The five sync scripts, from PSN / Blogspot / Goodreads / Flickr / Spotify | Build | A game's trophy counts |
| **Overridden** | Postgres, baked into `*-overrides.json` at build | Build | A game's rating and review |
| **Live** | Postgres, fetched by the browser | Page load | Comments, current build |

Tier 2 is not a new mechanism. `src/content/*-overrides.json` already exists,
and every sync script ends with the same line:

```js
Object.assign(entry.data, overrides[slug] ?? {});
```

Hand-authored facts layered over imported ones, keyed by slug — which is
exactly what "admin edits a field" means. So the database does not invent a
second content model; it becomes the editing surface for the one already
there, and `npm run overrides:pull` writes the DB back down into the JSON
files before a build.

The property worth protecting: **the site still builds with the database
switched off.** Overrides are committed files. If Postgres is down, deleted,
or never paid for again, `npm run build` produces the same 475 pages.

Tier 3 is the only part that needs the API at page-view time, and it must
degrade: every live value ships with its baked value already in the HTML, and
the island replaces it on hydrate. No spinners over content we already have.

```
                       ┌──────────────────────────┐
   PSN / Blogspot     ─┤  src/content/*.json      │  committed
   Goodreads / Flickr ─┤  src/content/            │  ← npm run overrides:pull
   Spotify            ─┤        *-overrides.json  │
                       └───────────┬──────────────┘
                                   │ astro build (GitHub Actions)
                                   ▼
                       ┌──────────────────────────┐
   browser ───────────▶│  Azure Static Web Apps   │  shinigamae.dev
                       └───────────┬──────────────┘
                                   │ fetch (CORS, credentials)
                                   ▼
                       ┌──────────────────────────┐
                       │  .NET API                │  api.shinigamae.dev
                       │  auth · comments ·       │
                       │  overrides · status      │
                       └───────────┬──────────────┘
                                   ▼
                       ┌──────────────────────────┐
                       │  PostgreSQL              │
                       └──────────────────────────┘
```

---

## 3. Decisions to make before code

These gate the work. My recommendation is in bold; none are irreversible.

| # | Decision | Options | Recommendation |
| --- | --- | --- | --- |
| D1 | Custom domain | Register `shinigamae.dev` now, or stay on `*.azurestaticapps.net` | **Register now.** See §5 — session cookies do not survive without it |
| D2 | SWA plan | Free, or Standard (~$9/app/mo) | **Free.** Standard buys same-origin `/api` and custom auth providers; D1 solves the problem those would solve |
| D3 | Where the API runs | Container Apps (scale to zero), App Service B1, Functions | **Container Apps**, min replicas 0. Accept a cold start on the first comment fetch |
| D4 | Postgres | Azure Database for PostgreSQL Flexible Server (Burstable B1ms), or Neon via Azure Marketplace | **Flexible Server** if it must sit in the resource group; **Neon** if monthly cost matters more than co-location |
| D5 | Anonymous comments | Publish immediately, or hold for admin review | **Publish immediately**, with rate limits and one-click delete. Revisit the first time it is abused |
| D6 | Identity storage | Store the Discord id, or display the name only | **Store the id.** You need a stable key to attribute a comment and to ban an account |
| D7 | Publish flow | Live edits only, or edits also trigger a rebuild | **Both, in that order.** Live first (phase 4a); the rebuild webhook is 4b and optional |

---

## 4. Phases

### Phase 0 — prep that needs no backend *(can start today)*

Everything here is doable against a mock and lands in `main` without waiting.

1. **`src/lib/api.ts`** — one typed fetch wrapper. Base URL from
   `import.meta.env.PUBLIC_API_URL`, `credentials: 'include'`, an
   `X-Requested-With` header on every mutation, a hard timeout, and a single
   place where "the API is unreachable" is handled. Nothing else calls
   `fetch`.
2. **An empty `PUBLIC_API_URL` means "no backend"** — every island checks it
   and renders the baked value silently. That is the feature flag; there is no
   other one.
3. **Write the OpenAPI document first** (§6). `src/content.config.ts` is
   already the contract — `STATUS.md` §3.3 says so — so the response shapes
   are the Zod schemas and the document is mostly transcription.
4. **Extract `currentStatus`** from `src/config/home.ts` into a component that
   takes the two values as props, so the island has a seam to mount into.
5. **Decide the comment key.** `content_type` + `slug`, where slug is the
   Astro collection id (the filename). Audit that those are stable — see §9.

### Phase 1 — infrastructure and the SWA cutover

Cut over to Static Web Apps **before** the auth work, not after. Removing
`base: '/air-chrysalis'` touches every URL in the project, and you do not want
that entangled with debugging an OAuth callback. It is also independent: the
site runs on SWA with no backend at all.

1. Resource group, in the tenant the API will live in. One region for
   everything (Southeast Asia) — cross-region chat between the API and
   Postgres is latency paid on every request, forever.
2. Create the Static Web App; swap `.github/workflows/deploy.yml` from
   `upload-pages-artifact` / `deploy-pages` to `Azure/static-web-apps-deploy`
   (`app_location: "/"`, `output_location: "dist"`). **Keep the
   `npm run check` gate** — it is why a bad content entry fails the deploy
   instead of shipping a blank page.
3. `astro.config.mjs`: `site: 'https://shinigamae.dev'`, delete the `base`
   line, and rewrite the `/lab` redirect target (it is built from `base` by
   hand). `withBase` / `stripBase` become identity functions, as designed.
4. **`staticwebapp.config.json`** — the thing GitHub Pages cannot do at all:

   ```jsonc
   {
     "routes": [{ "route": "/lab", "redirect": "/journeys", "statusCode": 301 }],
     "responseOverrides": { "404": { "rewrite": "/404.html" } },
     "globalHeaders": {
       "X-Robots-Tag": "noindex, nofollow",
       "Referrer-Policy": "strict-origin-when-cross-origin",
       "Content-Security-Policy": "default-src 'self'; frame-src https://open.spotify.com; ..."
     }
   }
   ```

   `/lab` becomes a real 301 instead of a meta-refresh page, and
   `X-Robots-Tag` covers `/rss.xml`, which the `noindex` meta tag cannot
   reach. **Derive the CSP's `img-src` list from the real image hosts in
   `dist/`** — PSN, Blogger, Goodreads, Flickr and Spotify's `i.scdn.co` all
   serve art here — and ship it report-only first. A wrong CSP breaks the site
   silently, in someone else's browser. The homepage's ON ROTATION player also
   needs `frame-src https://open.spotify.com`, without which the section
   renders as a chart with a blank hole in it.
5. Make the repository **private** again. `DEPLOY.md` records that it was made
   public solely because Pages will not serve a private repo on the free plan.
   SWA has no such rule, and the site is deliberately noindexed.
6. Postgres, API host, Key Vault. The API reaches Postgres over **managed
   identity**, not a connection string with a password in it.
7. DNS: apex to the SWA, `api.` to the API host. An apex domain wants Azure
   DNS alias records or a registrar supporting ALIAS/ANAME — unlike Pages,
   which just hands you four A records.
8. Re-run `DEPLOY.md`'s verification list against the new origin. The
   base-path checks invert: nothing should carry `/air-chrysalis` any more.

### Phase 2 — Discord sign-in

**Not SWA built-in auth.** Discord is not one of its preconfigured providers,
and custom OIDC registrations are Standard-only. Doing the OAuth exchange in
the .NET API is provider-agnostic, tier-agnostic, and moves with the API if
the host ever changes.

1. Register the Discord application. Scope: **`identify` only.** Not `email`,
   not `guilds` — you need a snowflake and a display name, and asking for more
   is a consent screen that makes guests think twice.
2. `GET /api/auth/discord/start` — generate `state` and a PKCE verifier, stash
   them in a short-lived cookie, 302 to Discord.
3. `GET /api/auth/discord/callback` — verify `state`, exchange the code, read
   the snowflake, upsert the user, create a session, 302 back to the page the
   user started from — **validated against an allowlist of your own paths.**
   An open redirect here is the classic bug in this flow.
4. **Admin is a snowflake in configuration**, read from Key Vault and compared
   on every privileged request. Not a `role` column: a flag in a table you can
   edit from the app you are building is a weaker fence than a constant you
   deploy.
5. `GET /api/me` → `{ id, name, avatar, isAdmin }` or 401. The header island
   calls it once and renders either a sign-in button or your avatar. Admin UI
   mounts only when this says so.
6. `POST /api/auth/logout` — delete the session row, clear the cookie.

Sessions are **opaque tokens in Postgres**, not JWTs. One admin and a handful
of guests is not a scale problem, and revoking a session by deleting a row is
worth more here than statelessness.

### Phase 3 — comments

1. Schema (§7) and endpoints (§6). Moderation is one control: for the admin,
   every comment grows an inline delete. That is the whole moderation UI.
2. A `CommentThread` island on the detail pages — builds, games, books,
   journeys. It renders after paint, never blocks, and says so plainly when
   the API is unreachable. `<noscript>` gets one line of prose, not a broken
   form.
3. Identity: signed in → name and avatar come **from the session**, never from
   the request body. Anonymous → an optional free-text display name, capped,
   with **no email field at all.** No email means no account recovery, no
   password reset, no breach surface, and nothing to write a privacy policy
   about.
4. The body is **plain text**, stored and rendered as text. No HTML, no
   Markdown. If Markdown is wanted later it is a server-side render of a
   strict subset, never a client-side one.
5. Abuse controls, all server-side: a length cap, a minimum interval between
   posts per IP hash, a honeypot field, and a global daily ceiling that trips a
   circuit breaker rather than letting a script run all night. Store a
   **salted HMAC of the IP**, never the address.

### Phase 4a — edit mode, live

1. `content_overrides`: one row per `(content_type, slug)` holding a JSONB
   `patch`. A literal mirror of `Object.assign(entry.data, overrides[slug])`,
   so there is no translation layer and no second model.
2. **The server validates every patch against a per-type field allowlist.** Do
   not accept arbitrary keys because the column happens to be schemaless — the
   allowlist is the field list `content.config.ts` already declares.
3. Admin islands: the home status panel first, then per-entry editors for the
   fields that are override-only today — build `status` and `notes`, game
   `rating` and `review`, book `thought`.
4. Pages read their overrides live, so an edit is visible immediately without
   a deploy. The baked value stays as the fallback.

### Phase 4b — edit mode, baked *(optional)*

1. `npm run overrides:pull` — `GET /api/overrides`, write the four
   `*-overrides.json` files, **preserving their `$comment` blocks**, which are
   the only documentation of what each file is for.
2. An admin "Publish" button → the API fires a GitHub `repository_dispatch` →
   a workflow runs the pull, commits as a bot, and deploys. Until that exists,
   running the script locally and pushing does the same job.

### Phase 5 — operations

Application Insights on the API, a cost alert on the subscription, a nightly
`pg_dump` to Blob Storage — the overrides also live in git, but **the comments
exist in exactly one place** — and an uptime check that pages nobody.

---

## 5. Cookies, CORS, and why the domain comes first

The free tier has **no linked backend**, so the site and the API are different
origins and the browser applies its cross-site rules. One consequence decides
D1:

- On `shinigamae.github.io` plus `*.azurewebsites.net`, the API's session
  cookie is a **third-party** cookie. Browsers are actively killing those.
  Sign-in would work today and quietly stop working later.
- On `shinigamae.dev` plus `api.shinigamae.dev`, the two share a registrable
  domain. The request is **same-site** (still cross-origin), so a
  `SameSite=Lax` cookie is sent normally and nothing is being phased out.

So: **register the domain in Phase 1.** `DEPLOY.md` already describes that
migration as a one-line config change; this is the reason to actually do it.

The rules that follow:

- Cookie: `HttpOnly; Secure; SameSite=Lax; Path=/`, host-only on the API.
- CORS: an explicit origin allowlist (production plus `localhost:4321`) with
  `Allow-Credentials: true`. Never `*` — it is not even legal with
  credentials.
- CSRF: `SameSite=Lax` blocks a cross-site POST from `evil.com`, and requiring
  a custom header (`X-Requested-With`) on mutations means a plain form post
  cannot reach a write endpoint at all. Both, not either.

If `/api/*` should later be served from the site's own origin — no CORS, no
cookie question — that is the SWA **Standard** plan's linked backend, ~$9/mo.
Worth revisiting only if the above becomes a nuisance.

---

## 6. API surface

```
GET    /api/health                     → 200, no auth, no DB round-trip

GET    /api/auth/discord/start?return= → 302 to Discord
GET    /api/auth/discord/callback      → 302 back to the site, sets session
POST   /api/auth/logout                → 204
GET    /api/me                         → { id, name, avatar, isAdmin } | 401

GET    /api/comments?type=&slug=       → [{ id, name, isAdmin, body, createdAt }]
POST   /api/comments                   → { type, slug, body, name? } → 201
DELETE /api/comments/{id}              → admin, or the author's own → 204

GET    /api/overrides                  → { builds: {…}, games: {…}, … }
GET    /api/overrides/{type}/{slug}    → { patch }
PUT    /api/overrides/{type}/{slug}    → admin, validated patch → 200

GET    /api/status                     → { building, nextBuild }
PUT    /api/status                     → admin → 200
```

`GET /api/overrides` returns exactly the shape of the override files, so
`overrides:pull` is a write to disk and nothing more.

---

## 7. Data model

```sql
users (
  discord_id     text primary key,      -- the snowflake; never an app-local id
  display_name   text not null,         -- cached from Discord, refreshed on login
  avatar_hash    text,
  first_seen_at  timestamptz not null,
  last_seen_at   timestamptz not null,
  banned_at      timestamptz            -- D5's escape hatch
)

sessions (
  token_hash     bytea primary key,     -- store the hash; the cookie holds the token
  discord_id     text references users,
  created_at     timestamptz not null,
  expires_at     timestamptz not null,
  user_agent     text
)

comments (
  id             bigserial primary key,
  content_type   text not null,         -- 'build' | 'game' | 'book' | 'album'
  slug           text not null,         -- the Astro collection id
  discord_id     text references users, -- null when anonymous
  display_name   text,                  -- anonymous only; capped
  body           text not null,         -- plain text, capped
  created_at     timestamptz not null,
  deleted_at     timestamptz,           -- soft delete, so a thread keeps its shape
  ip_hash        bytea                  -- salted HMAC, for rate limiting only
)
-- index on (content_type, slug, created_at)

content_overrides (
  content_type   text not null,
  slug           text not null,
  patch          jsonb not null,        -- mirrors *-overrides.json exactly
  updated_at     timestamptz not null,
  updated_by     text references users,
  primary key (content_type, slug)
)

site_status (
  id             int primary key default 1 check (id = 1),
  building       text not null,
  next_build     text not null,
  updated_at     timestamptz not null
)

audit_log (id, at, discord_id, action, target, before jsonb, after jsonb)
```

EF Core migrations, checked in. `audit_log` earns its place precisely because
there is only one admin: when something changes and you do not remember
changing it, that table is the only way to find out what happened.

---

## 8. Cost

Rough, monthly, and worth checking against current pricing rather than
trusting this table:

| Item | On the free tier | Otherwise |
| --- | --- | --- |
| Static Web Apps | Free plan covers it — `dist/` is 8.9 MB against a 250 MB cap, ~700 files against 15,000, 100 GB/mo bandwidth | Standard ~$9 |
| API on Container Apps | The monthly free grant covers a site this quiet | Pennies above it |
| PostgreSQL Flexible Server (B1ms) | A 12-month free offer exists for eligible new subscriptions | ~$12–15 — **the largest line item by far** |
| Key Vault, Blob backups, App Insights | Negligible at this volume | — |

Postgres dominates. If that is the wrong shape for a personal site, D4's Neon
option keeps a free Postgres inside the Azure billing relationship, at the
cost of it not sitting in the resource group.

One thing the free tier does **not** have: overage bandwidth. Past 100 GB in a
month the app stops serving rather than billing you, where GitHub Pages' limit
is a soft one. Theoretical for a noindexed personal site; worth knowing.

---

## 9. Risks, in the order they will bite

1. **Third-party cookies.** §5. The reason D1 comes first.
2. **Slug churn orphans comments.** A Blogspot title edit renames a build's
   file, and every comment keyed to the old slug detaches silently. Before
   Phase 3, confirm the sync scripts' slug derivation is stable, and make a
   sync warn when it renames an entry that has comments.
3. **Cold starts.** Scale-to-zero means the first comment fetch after a quiet
   hour is slow. Acceptable *because* comments load after paint and never
   block the page — which is only true if Phase 3 point 2 is respected.
4. **Anonymous comments are a spam magnet.** Being noindexed helps for now,
   and stops helping the moment the site is indexed. D5 is a decision you will
   revisit; Phase 3 point 5 is what buys you time to revisit it calmly.
5. **Two sources of truth.** Every live field has a baked value behind it, and
   they will disagree. The rule that keeps it sane: baked is the fallback,
   live wins on hydrate, `overrides:pull` makes them agree again at the next
   build. Never write a page that reads only one of the two.
6. **CSP.** Get it wrong and the site breaks for someone else, not for you.
   Report-only first.

---

## 10. Open questions

D1–D7 in §3 are the real ones. D1 (domain) and D4 (Postgres flavour) need
answers before Phase 1 starts; the rest can wait for the phase that needs
them.
