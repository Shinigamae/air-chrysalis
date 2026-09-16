# SHINIGAMAE

A personal digital workshop and archive — things made, played, read, and shipped.

The name carries no TLD, here or in the site's own header: the domain is not
registered and `.dev` and `.com` are both still open. Where planning documents
write `shinigamae.dev` it is a placeholder — see `PLAN.md` §3, D1.

Dark editorial × technical manual. The design language lives in Figma
(`SHINIGAMAE.DEV` › `01 — Design Direction`) and is the source of truth;
`FIGMA.md` holds the implementation brief, `DEPLOY.md` how it ships, and
`PLAN.md` what comes next — the API, the database, and accounts — and
`BACKEND.md` how that API is designed.

## Stack

| Concern     | Choice                                            |
| ----------- | ------------------------------------------------- |
| Framework   | Astro 7 (static output)                           |
| Styling     | Tailwind CSS 4 (CSS-first `@theme` tokens)        |
| Interactive | React 19, as islands, only where state is needed  |
| Language    | TypeScript (strict)                               |
| Fonts       | Space Grotesk + IBM Plex Mono, self-hosted        |
| Package mgr | npm                                               |

A .NET REST API and database will be added later; nothing here assumes a
client-side data layer yet.

## Commands

```sh
npm run dev      # dev server on http://localhost:4321
npm run build    # static build to dist/
npm run preview  # serve dist/
npm run check    # astro check (types + template diagnostics)
npm run blog:check   # report what a build-archive sync would change
npm run blog:sync    # import the build archive from Blogspot (see below)
npm run books:check  # report what a reading-log sync would change
npm run books:sync   # import the reading log from Goodreads (see below)
npm run games:check  # report what a gaming-log sync would change
npm run games:sync   # import the gaming log from PSN (see below)
npm run albums:check # report what a journeys sync would change
npm run albums:sync  # import Flickr albums (see below)
npm run music:auth   # one-time Spotify consent, issues a refresh token
npm run music:check  # report what an on-rotation sync would change
npm run music:sync   # import the play counts from Spotify (see below)
npm run content:sync # all five of the above
npm run figma:check  # report Figma/code drift (see below)
```

`astro dev` backgrounds itself. Manage it with `npx astro dev status`,
`npx astro dev logs`, `npx astro dev stop`.

> `astro check` needs TypeScript 6.x — TypeScript 7's native compiler does not
> yet expose the API it relies on, so `typescript` is pinned to `^6`.

## Content

Photography is real apart from three client slots on `/workshop` — see
`IMAGES.md` for which file maps to which slot, and `npm run placeholders` to
regenerate the ones still standing in. Build, game, book and album art is
never local: it arrives hotlinked with its feed.

Content lives in `src/content/`, typed by `src/content.config.ts`. The layout
follows the structure sketched in FIGMA.md, and the schemas are shaped from
Figma "03 — Content Systems":

```
src/content/
  builds/<slug>.json     one file per build  — generated, see below
  books/<slug>.json      one file per book   — generated, see below
  games/<slug>.json      one file per game   — generated, see below
  albums/<slug>.json     one file per album  — generated, see below
  projects/projects.json single array (file loader)
  clients/clients.json   single array (file loader) — hand-written
```

`astro check` validates every entry against its schema, so a malformed field
fails the build rather than rendering blank.

**`builds/`, `books/`, `games/` and `albums/` are generated — do not hand-edit
them.** See below.

These schemas are also the contract a future .NET API has to satisfy, which is
why they are explicit rather than loose. Ordering is explicit too — `builds`
sort by `index` and `projects` by `order`, because sorting by year alone left
same-year entries in arbitrary alphabetical order.

Entries in `projects/` and `clients/` are real and hand-maintained — they are
the only content here that no sync touches, so they are also the only content
safe to edit by hand.

## The build archive comes from Blogspot

`src/content/builds/*.json` is generated from
<https://shinigamae.blogspot.com/feeds/posts/default> by `npm run blog:sync`,
and committed. Post on the blog, run the sync, commit the result — there is no
second copy of a build to keep in step.

The generated files are overwritten on every sync, so corrections do not go in
them. They go in `src/content/builds-overrides.json`, keyed by slug:

```json
"mnp-xh04-nezha": { "grade": "HiRM", "scale": "NON-SCALE" }
```

Anything in the schema may be overridden. In practice one field needs it:

- **`grade`** — third-party makers (Daban, Shenma, Hemoxian) have no Bandai
  grade, so it is usually absent. That is fine: the kicker falls back to the
  scale alone rather than rendering a dangling separator.

`status` is imported but no longer rendered anywhere on the builds pages. Every
published post is `archive`, which left the label and its facet rail saying the
same thing 33 times, so both were removed. The field and the slot beside the
section header are reserved for a facet worth having — series or manufacturer.

`npm run blog:check` writes nothing and lists both what would change and which
entries are still missing `grade`, `scale` or `series`.

### What the importer derives

| Field | From |
| --- | --- |
| `manufacturer`, `title` | post title, split on `\|` |
| `grade`, `scale` | any grade token or `1/144` anywhere in the title |
| `series`, `kind`, `tags` | post labels, normalised in `scripts/blog-sync.mjs` |
| `summary`, `body` | post prose, stripped of markup |
| `pros`, `cons` | bullets under the post's `Pros:` / `Cons:` headings |
| `hero`, `video` | the post's YouTube embed |
| `gallery` | post images, rewritten to `/s1600/` originals |
| `buildDate`, `sourceUrl` | post date and permalink |

The title convention is `Brand | Scale/Grade | Model kit name`, but the
importer does not depend on it: a post that drops the middle segment still
imports, just with more to fill in by hand.

Photos are **hotlinked** from Google's CDN rather than downloaded, so the repo
stays small — at the cost of depending on those URLs surviving. If that becomes
a problem, the fix is a download step in `blog-sync.mjs`, not a schema change.

## The reading log comes from Goodreads

`src/content/books/*.json` is generated from the Goodreads per-shelf RSS feed
by `npm run books:sync`, and committed. Corrections go in
`src/content/books-overrides.json`, keyed by slug, exactly as for builds.

Goodreads **retired their API** — no keys since December 2020 — but the RSS
feed survives and carries more than the old API's review call: cover art, page
count, publication year, community rating, and the review text. Two shelves are
read, `currently-reading` (which sets `current` and `status: live`) and `read`.

### The shelf has to be public

A private shelf answers every request with `401 Sorry, that person's shelf is
private`, and the sync stops with that message rather than a stack trace.
Make it public under **Settings → Privacy** on goodreads.com.

### What the importer derives

| Field | From |
| --- | --- |
| `title`, `author` | `title`, `author_name` |
| `rating` | `user_rating`, with Goodreads' `0` read as unrated |
| `thought`, `review` | `user_review`, lead paragraph and the rest |
| `finishedOn`, `addedOn` | `user_read_at`, `user_date_added` |
| `cover` | `book_large_image_url`, hotlinked |
| `pages`, `published`, `averageRating`, `isbn` | the book record |
| `goodreadsUrl`, `shelves` | review permalink, `user_shelves` |

Two gaps are normal rather than errors. About **half** of a typical shelf is
rated but never reviewed, so `thought` is often empty and nothing may assume
it. And a large share carries no `user_read_at` at all — those sort by
`addedOn` and stay off the reading timeline, which is what the sync's closing
summary counts for you.

The index is **paginated at 48 a page**. Unpaginated, a few hundred books
rendered close to a megabyte of HTML on one route. The feature slot and the
timeline stay on page one; `/books/2` onward is just the grid.

`rss.xml` is capped at the 50 newest entries across all four collections, for
the same reason.

## The gaming log comes from PlayStation Network

`src/content/games/*.json` is generated by `npm run games:sync`, and committed.
Corrections go in `src/content/games-overrides.json`, keyed by slug.

### Why not psnprofiles.com

That was the obvious source and it does not work. `psnprofiles.com` sits
behind a Cloudflare JavaScript challenge — every request returns `403 Just a
moment...` — and its `robots.txt` disallows automated agents by name. Exophase
and TrueTrophies are behind the same wall. Scraping any of them would mean
defeating bot protection the site has explicitly asked us to respect.

PSNProfiles is a mirror of data Sony already holds, so the sync goes to the
source instead, through [`psn-api`](https://github.com/achievements-app/psn-api)
(MIT, zero dependencies). Same account, one hop closer, nothing to evade.

### The token expires, roughly every two months

Authentication is an `npsso` cookie value:

1. Sign in at <https://www.playstation.com>
2. Open <https://ca.account.sony.com/api/v1/ssocookie> in the same browser
3. Copy the `npsso` value out of the JSON

Put it in `.env` as `PSN_NPSSO=...` (gitignored, same as `FIGMA_TOKEN`) and in
the **`PSN_NPSSO`** repository secret for Actions. When it lapses the sync
stops with instructions rather than a stack trace, the daily workflow goes
red, and the other two sources still sync and deploy.

### The API is not reachable from every network

`m.np.playstation.com` is blocked on many corporate and school networks — it
answers with an HTML block page or resets the connection, while the auth host
`ca.account.sony.com` works fine. The sync tells these three cases apart, so
the message you get names the real problem instead of blaming the token:

- **reached PSN, token refused** → the credential expired, go and refresh it
- **HTML instead of JSON** → the data host is blocked; run it in CI
- **connection failed during auth** → the network dropped it; run it in CI

If your network is one of the blocked ones, set the repository secret and let
the workflow do the syncing — `gh workflow run content-sync.yml`.

### What the importer derives

Two endpoints are merged, because neither is enough alone. `getUserTitles`
supplies trophy progress — the `progress` field the design is built around —
and `getUserPlayedGames` supplies playtime, which the trophy API knows nothing
about. They use different id spaces, so they are matched on a normalised
title; a game that fails to match still imports, just without hours.

| Field | From |
| --- | --- |
| `title`, `platform` | trophy title and platform, trademark furniture stripped |
| `progress`, `trophies`, `platinum` | trophy counts |
| `playtimeHours`, `firstPlayedOn` | played-games record, `PT228H56M33S` parsed |
| `year`, `lastPlayedOn`, `current` | most recent trophy or play |
| `icon`, `art` | trophy-set icon and store art, hotlinked |

Only games **above 1% trophy progress** are imported, and hidden titles are
skipped — otherwise the log fills with demos and PS Plus freebies. A game you
played without earning a trophy will not appear at all.

`playStatus` is **inferred**, because PSN has no notion of giving up on
something: 100% or a platinum is `finished`, a trophy within 60 days is
`in-progress`, and anything else is `abandoned`. That last one is a judgement
and is often unfair to a long game played in bursts — override it.

`rating`, `review` and `screenshots` are **override-only** and always import
empty. Sony has no opinion to give, and its promotional art is not your
screenshots; that imports separately as `art`.

## Journeys comes from Flickr

`src/content/albums/*.json` is generated by `npm run albums:sync`. Corrections
go in `src/content/albums-overrides.json` — most usefully `description`, since
Flickr's is boilerplate whenever an album has none.

This section used to be **LAB**, which had no content model. `/lab` redirects
to `/journeys`, so anything already shared still resolves.

**No credential.** Flickr restricted new API keys to Pro accounts, so this
takes a keyless route: three sources, because no one of them is enough.

| Source | Gives |
| --- | --- |
| the albums page | album ids and titles |
| each album page | that album's photo ids, and its true photo count |
| oEmbed, per photo | the photo's title, and its **standard** secret |

That last one is the trick. A Flickr image URL is
`{server}/{id}_{secret}_{size}.jpg`, and the size suffix **cannot** be
rewritten: the very large sizes (`_h`, `_k`) carry a different secret from the
ordinary ones, and album pages embed only those — rewriting `_h` down to `_z`
returns `410 Gone`. oEmbed hands back the standard secret, which does open
`_z` and `_b`. Without it the strips would serve 1600px originals at 200px
tall.

Only the first ten of each album are imported, by design. `photoCount` is the
true total on Flickr, and the last frame of each strip offers the difference —
the site is the teaser, Flickr keeps the set. There are no album detail pages
for the same reason.

### Known costs of going keyless

- It **reads pages `robots.txt` disallows** (`User-agent: *` / `Disallow: /`).
  Done because the content is the owner's own and public, at a few dozen
  requests a day, with an honest User-Agent and a throttle — and with no
  browser emulation or challenge solving, so a bot check makes the sync fail
  loudly rather than get worked around.
- It **depends on Flickr's markup.** A redesign breaks the parsing. The sync
  refuses to write when it finds zero albums, so a break empties the logs
  rather than the site.
- **No per-photo dimensions**, so strip frames are a uniform 3:2 crop rather
  than each photo's own ratio.
- **No EXIF dates and no album creation dates**, so albums cannot be ordered
  or labelled by when the photos were taken — only by Flickr's album order.
- **~110 requests per run** (one per album, one per photo) against a handful
  for an API call. Slower, and more exposed to transient failure.

A Pro account restores the API and collapses all of this; `git log` has the
key-based version of this script if that ever happens.

## On rotation comes from Spotify

`npm run music:sync` writes `src/content/music/rotation.json` — the playlists you
own, most recently played first. `npm run music:check` reports what would change
and writes nothing.

Three values, in `.env` (gitignored) or the environment:

| | |
| --- | --- |
| `SPOTIFY_CLIENT_ID` | from the Spotify developer dashboard |
| `SPOTIFY_CLIENT_SECRET` | the same app |
| `SPOTIFY_REFRESH_TOKEN` | `npm run music:auth`, once — it prints the line, it does not write `.env` |

### Why playlists, and not a play count

This was a chart of most-played tracks, and the change is the point.

A play count claims to be what you listened to, and that claim is what made it
need an exclusion list: music played for someone else on the account is still
listening, and Spotify counts it. Playlist privacy hides the playlist, not the
plays, so a bedtime playlist on repeat ranked above everything — and the fix was
a hand-maintained denylist of track ids, first in the sync script and then as an
admin control writing `content_overrides('music', 'rotation')`.

A list of playlists you **own** needs none of that. A playlist is curated by
existing, so the curation happens in Spotify where you already are. Spotify's own
playlists — Discover Weekly, Release Radar, the daylists, anything under the
`37i9dQZF1…` prefix — are filtered out, because they are recommendations rather
than choices.

**Private playlists are filtered out too, and not on the flag alone.** Listing a
playlist promises a reader that the link works for them, so the sync asks that
question literally: it re-fetches each candidate with app-only credentials, which
know nothing about you, and believes that answer over `public`. Spotify's
"private" does not mean unreachable and its `public` field can come back null, so
a flag is the wrong thing to publish someone's listening on. A failed check reads
as "not visible", which is the safe direction to be wrong in.

What it cost is the claim. The section no longer says what was played most; it
says what was last reached for, which is smaller and more honest.

### What the API will and will not give

There is **no "recently played playlists" endpoint.** `/me/player/recently-played`
is the only thing that knows a playlist was played: each item carries a `context`,
and for a playlist that context is its URI. The sync derives the list from those,
walking back a few pages of history to find enough distinct ones. A playlist you
have not played in about a week falls off, which is the intent.

**App-only credentials are not enough**, which is the one thing hoped for and not
delivered. Client-credentials tokens return playlist *metadata* with no track list
and cannot see recently-played at all, since that is user data. So the refresh
token stays. It needs no new scope: the existing `user-read-recently-played` covers
the history, and reading a public playlist needs no scope at all.

**The track list is under `items`, not `tracks`.** This was written up here as
"there is no track count" — `/playlists/{id}/tracks` answers 403 and the
documented `tracks.total` is missing from the playlist response, which reads
like an app that may not see track lists. It is not. Spotify renamed the
relation: the collection is `/playlists/{id}/items`, each entry holds `item`
where the docs say `track`, and both answer 200 with the same user token and no
extra scope. So the shelf carries its own track list and the count beside a
playlist name is real.

That list is paged and long — the playlists here run past a hundred tracks — so
the sync writes only the first `SPOTIFY_TRACKS` (default 20, ten rows in each of
the section's two columns) and keeps the total beside it. The section prints
"20 OF 103 TRACKS" and never a bare number, because the number it holds is not
the number the playlist has.

A 403 here is survivable rather than fatal: the playlist still goes on the shelf
with an empty `tracks`, and its panel falls back to Spotify's tall embed, which
lists the contents itself. That fallback was the whole section until this.

There is also no `preview_url`: Spotify stopped returning it to apps registered
after November 2024, so playback is their iframe embed and nothing else.

## Edit mode

One person can edit this site from the site itself. Everyone else gets a build with none
of it in — not a disabled version, an absent one.

### The switch

A rail at the bottom of the viewport, mounted once in `AppShell`. It appears only when
all three of these hold:

1. `PUBLIC_API_URL` is set in the build,
2. `GET /api/me` answers with a user, and
3. that user is the admin.

It is a rail rather than a control in the header because the header is a designed object
with three breakpoint behaviours and a mobile variant that replaces it outright; adding
something only one person sees to all four was not worth it.

**The switch is not a permission.** Every write endpoint re-reads the admin allowlist
from configuration on the request itself, so flipping the flag in devtools produces a
page full of controls and a 403 from each one. What `isAdmin` decides on the client is
whether a control is worth *showing*, which is a question about clutter.

### What is editable

| Where | Fields | Goes to |
| --- | --- | --- |
| Home · CURRENT STATUS | `building`, `nextBuild` | `PUT /api/status` |
| Home · ON ROTATION | hide a track | `PUT /api/overrides/music/rotation` |
| Game detail | `rating`, `review`, `playStatus`, `current`, `status` | `PUT /api/overrides/games/{slug}` |
| Workshop | projects and clients — add, edit, delete | `PUT /api/content/{type}/{slug}` |

PLAYING and READING on the status panel are deliberately not editable: the collections
already know the answer, and a hand-typed one goes stale silently — that panel once
claimed a game the gaming log had not shown as current for months.

A client's `logo` and `shot` are not editable either. They are paths into `src/assets`
that `astro:assets` resizes and re-encodes at build time to emit a srcset, and a string
typed into a form cannot do that. The server carries them across an edit untouched.

### The thing to understand about what you see

**The site is still a static build.** It reads its JSON at build time and has not been
switched over to the API. So a value saved in edit mode is live on the server and will
not appear in the HTML until the next deploy bakes it in.

That is why every editor loads its *own* current state from the API when it opens rather
than pre-filling from the page around it. Pre-filling from the baked page would show a
stale value, and saving it would quietly overwrite a newer edit with an older one.

Where it is cheap, an editor also patches the page in place after a save, so the panel
you are looking at agrees with what you just did. That is a courtesy, not the record.

### What it costs a reader

Nothing on GitHub Pages, which is built with no `PUBLIC_API_URL` at all: the islands are
gated on it in the `.astro` files, so no `<astro-island>` is emitted and no page
references any of the edit chunks. The only JavaScript any page loads there is Astro's
client runtime and `MobileMenu`, exactly as before edit mode existed.

On Azure Static Web Apps, which does have the API, a reader carries the admin bar's shell
and the live layer — a few KB — and nothing else. The editor forms sit behind a dynamic
import requested when the switch goes on.

With the backend wired, the cost is one small shell per editable region. The forms
themselves — inputs, validation, save machinery, about 27 KB — sit behind a dynamic
import that is requested when the switch goes on and never before. See
`src/components/edit/lazyEditIsland.tsx`.

### Running it locally

```sh
# in shinigamae-api
dotnet run --project src/Shinigamae.Api          # http://localhost:5181

# here
echo 'PUBLIC_API_URL=http://localhost:5181' >> .env
npm run dev
```

The rail then offers SIGN IN (DEV), which calls `POST /api/auth/dev`. That endpoint is
blocked outright in Production and gated behind `Auth:DevAuthEnabled` everywhere else, so
it cannot become the real door by accident. To be an admin locally, set
`Admin:Identities:0` to `discord:000000000000000000` in the API.

On a deployed site the door is **Discord**. The site generates a `state`, sends the
browser to Discord, gets `?code=&state=` back, checks the state, and posts the code to
`/api/auth/discord/exchange` — the exchange happens server-side, so the client secret
never reaches a browser. The code is stripped from the address bar immediately: leaving
it there means a refresh retries a credential the provider has already spent.

**The redirect URI is registered against the site, not the API**, because the browser
comes back here. In the Discord Developer Portal that is
`https://polite-plant-0ab659c00.5.azurestaticapps.net/` for the deployed site.

### Layout

```
src/lib/api.ts              the only thing in the project that calls fetch
src/lib/edit-mode.ts        session + switch state, shared across islands
src/components/edit/
  AdminBar.tsx              the rail and the switch
  lazyEditIsland.tsx        the shell that defers an editor's code
  EditRegion.tsx            loads a region's current server state
  controls.tsx              the form vocabulary
  *Editor.tsx               island shells
  *EditorForm.tsx           the forms themselves, loaded on demand
```

State is shared through a plain store with `useSyncExternalStore` in front of it rather
than a context provider, because Astro hydrates each island as its own React root — the
rail in the shell and the rating control on a game page are separate trees that happen to
be on the same page.

## Following Figma over time

The Figma file is the source of truth, so there is a report that tells you when
code and design have diverged. It never edits your CSS.

```sh
npm run figma:check   # report drift; exit 1 if any, 0 if in sync
npm run figma:sync    # accept current Figma as the new baseline
```

It needs a token. Create one at Figma › Settings › Security › Personal access
tokens with scope `file_content:read`, then put it in `.env` (gitignored):

```
FIGMA_TOKEN=figd_...
```

`figma:check` answers three questions:

1. **Has the file moved?** Compares Figma's `version` against the baseline in
   `design/figma.sync.json`.
2. **Did the design system change?** Diffs the Foundations frame (colours,
   layout rules, type scale) and all ten components against that baseline, and
   names the source file that owns each change. Copy edits are listed
   separately from geometry and style changes.
3. **Does the code match?** Compares the Foundations swatches against the
   `--color-*` tokens in `src/styles/tokens.css`.

It also flags two integrity problems: a swatch whose fill disagrees with its
own hex label, and a component node id that no longer exists (which happens
when a component is deleted and redrawn rather than edited).

### The known weakness

No node in the Figma file uses a published paint or text style — every colour
is raw hex typed onto individual nodes, and the type scale exists only as a
text label reading `34 / 40 / MEDIUM`. So the token layer is *parsed out of
the Foundations frame* rather than read from a real token source.

That works, but it is inference. **Publishing paint and text styles in Figma
would make this exact and is the single highest-value fix.** Figma Variables
would be better still, but reading them over the REST API requires an
Enterprise plan, so named styles are the practical choice. Once styles exist,
replace `extractFoundations()` with a read of the file's `styles` map.

Related: the `02 — Homepage` frame still carries a different palette from
Foundations (`#060709 / #2ECCF5 / #F0F2F7`, 2px radius, Space Grotesk 700) and
56px margins instead of 64px. The report deliberately does not read that frame,
so it will not nag — but the two pages disagree, and Foundations is the one the
code follows.

### Node ids

Every component file names its Figma node in the header comment, e.g.
`Figma "Editorial Card" (33:49)`. Given a changed node, `grep -r 33:49 src/`
finds the code. Ids survive renames and moves; they do not survive
delete-and-redraw.

## Structure

```
src/
  config/site.ts          Brand, navigation, active-route helpers — one source of truth
  layouts/AppShell.astro  The shell every route renders through
  components/
    layout/               SiteHeader · NavLink · TopBar · MobileNavigation · MobileMenu · SiteFooter
    ui/                   PageHeader · SectionHeader · EditorialCard · StatusLabel · FilterControl
                          SpecRow · SpecList · StatusPanel · ReadingTimeline
                          PlatformTags · TrophyCounts (games) · StarRating (books)
                          ClientCard (workshop) · Rotation (home, music)
  assets/                 Local art — imported, so astro:assets resizes and
                          re-encodes it. public/ holds only the favicon.
  content.config.ts       Collection schemas (the API contract, too)
  content/                builds/*.json · games/games.json · books/books.json
                          projects/projects.json · clients/clients.json
                          music/rotation.json (one snapshot, not a growing log)
  pages/                  One directory per section; [slug].astro generates detail routes
  styles/
    tokens.css            Colour, spacing, radius, type scale, motion, breakpoints
    typography.css        .type-* primitives (the two voices)
    globals.css           Tailwind entry, base rules, layout container
```

### Design rules worth knowing

- **Colour** comes only from `tokens.css`. Cyan (`--color-signal`) is a signal,
  not a decoration — active state, focus, metadata keys. The platform tints
  (`--color-ps4`, `--color-ps5`, …), the four trophy tints
  (`--color-platinum`, `--color-gold`, `--color-silver`, `--color-bronze`)
  and the section accents
  (`--color-word-code`, …) are the only other hues, and each is confined to
  one thing: a platform chip, a shining card edge, a trophy mark, a star, a
  section.
  A section accent is a pair of stops keyed by the word the hero uses for it,
  and it is that section's colour everywhere: the lit hero word, the edge of
  the card it opens, and its tab in the header once you are inside. The header
  used to light every tab in the one cyan, which said that something was
  current without saying what. `navigation` carries the key as `accent`, so
  the name lives in one place.
  The accents sit outside `@theme`, in the `:root` block below it — a theme
  key no utility class reaches is pruned from the build, and the two things
  reading these are a stylesheet the homepage generates and a custom property
  set inline by `NavLink`.
- **Spacing** is an 8px base: Tailwind's `--spacing` is set to `8px`, so
  `1 · 2 · 3 · 5 · 8` are the design's `8 · 16 · 24 · 40 · 64` steps.
- **Type** has two voices: Space Grotesk for editorial, IBM Plex Mono for
  technical metadata. Use the `.type-*` primitives, not ad-hoc sizes.
- **Motion** stays inside 150–220ms and is disabled under
  `prefers-reduced-motion`.
- **Breakpoints** are `sm 480 · md 768 · lg 1120 · xl 1440`. `md` is the shell
  switch: below it `MobileNavigation` replaces the desktop header entirely.
