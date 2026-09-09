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
  builds/<slug>.json     one file per build (glob loader) — they grow indefinitely
  games/games.json       single array (file loader)
  books/books.json       single array
  projects/projects.json single array
```

Adding a build is a new JSON file; its detail page at `/builds/<slug>` is
generated automatically. `astro check` validates every entry against its
schema, so a malformed field fails the build rather than rendering blank.

These schemas are also the contract a future .NET API has to satisfy, which is
why they are explicit rather than loose. Ordering is explicit too — `builds`
sort by `index` and `projects` by `order`, because sorting by year alone left
same-year entries in arbitrary alphabetical order.

Current entries are **seed data** — real examples where the design supplied
them (Astray Gold Frame, Destiny Gundam, Where Winds Meet) and plausible
placeholders elsewhere. Replace them; nothing in the code depends on them.

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
