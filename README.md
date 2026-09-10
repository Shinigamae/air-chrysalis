# SHINIGAMAE.DEV

A personal digital workshop and archive — things made, played, read, and shipped.

Dark editorial × technical manual. The design language lives in Figma
(`SHINIGAMAE.DEV` › `01 — Design Direction`) and is the source of truth;
`FIGMA.md` holds the implementation brief.

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
npm run content:sync # all three of the above
npm run figma:check  # report Figma/code drift (see below)
```

`astro dev` backgrounds itself. Manage it with `npx astro dev status`,
`npx astro dev logs`, `npx astro dev stop`.

> `astro check` needs TypeScript 6.x — TypeScript 7's native compiler does not
> yet expose the API it relies on, so `typescript` is pinned to `^6`.

## Content

Images are labelled placeholders for now — see `IMAGES.md` for which file
maps to which slot, and `npm run placeholders` to regenerate them.

Content lives in `src/content/`, typed by `src/content.config.ts`. The layout
follows the structure sketched in FIGMA.md, and the schemas are shaped from
Figma "03 — Content Systems":

```
src/content/
  builds/<slug>.json     one file per build  — generated, see below
  books/<slug>.json      one file per book   — generated, see below
  games/<slug>.json      one file per game   — generated, see below
  projects/projects.json single array (file loader)
```

`astro check` validates every entry against its schema, so a malformed field
fails the build rather than rendering blank.

**`builds/`, `books/` and `games/` are generated — do not hand-edit them.**
See below.

These schemas are also the contract a future .NET API has to satisfy, which is
why they are explicit rather than loose. Ordering is explicit too — `builds`
sort by `index` and `projects` by `order`, because sorting by year alone left
same-year entries in arbitrary alphabetical order.

Entries in `projects/` are still **seed data**. Replace them; nothing in the
code depends on them.

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
  content.config.ts       Collection schemas (the API contract, too)
  content/                builds/*.json · games/games.json · books/books.json · projects/projects.json
  pages/                  One directory per section; [slug].astro generates detail routes
  styles/
    tokens.css            Colour, spacing, radius, type scale, motion, breakpoints
    typography.css        .type-* primitives (the two voices)
    globals.css           Tailwind entry, base rules, layout container
```

### Design rules worth knowing

- **Colour** comes only from `tokens.css`. Cyan (`--color-signal`) is a signal,
  not a decoration — active state, focus, metadata keys.
- **Spacing** is an 8px base: Tailwind's `--spacing` is set to `8px`, so
  `1 · 2 · 3 · 5 · 8` are the design's `8 · 16 · 24 · 40 · 64` steps.
- **Type** has two voices: Space Grotesk for editorial, IBM Plex Mono for
  technical metadata. Use the `.type-*` primitives, not ad-hoc sizes.
- **Motion** stays inside 150–220ms and is disabled under
  `prefers-reduced-motion`.
- **Breakpoints** are `sm 480 · md 768 · lg 1120 · xl 1440`. `md` is the shell
  switch: below it `MobileNavigation` replaces the desktop header entirely.
