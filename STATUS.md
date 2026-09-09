# SHINIGAMAE.DEV — status, known issues, next steps

Last updated: 2026-09-09

Companion to `FIGMA.md` (the brief) and `README.md` (how to run it). This file
tracks what is built, what is knowingly wrong or unfinished, and what comes
next. Keep it current — it is the handover document between sessions.

---

## 1. Where the project stands

**Step 1 — App shell.** Complete. Tokens, typography, horizontal header,
mobile navigation with overlay menu, page-context strip, footer, six routes,
responsive foundation, accessibility baseline.

**Step 2 — Home.** Complete. Hero, standfirst, current-status panel, and the
four "selected work" cards, measured against the Figma nodes.

**Step 3 — Content layer and section pages.** Complete. Typed collections plus
Workshop, Builds, Games and Books, with generated detail routes.

17 pages build. `astro check` reports 0 errors, 0 warnings, 0 hints across 33
files. No horizontal overflow at 390 / 768 / 1120 / 1440.

| Route | State |
| --- | --- |
| `/` | Built from Figma `02 — Homepage` |
| `/workshop` | Case-study pattern, 3 seed projects |
| `/builds` + `/builds/<slug>` | Index with working status filter, 3 seed builds |
| `/games` + `/games/<slug>` | Currently-playing feature + index, 4 seed games |
| `/books` + `/books/<slug>` | Current book + reading timeline + index, 4 seed books |
| `/lab` | **Still a placeholder** — no design exists for it |

---

## 2. Known issues

### 2.1 Blocking further design fidelity

**The four `Templates — V1` frames have never been read.**
Nodes `33:133` (01 EDITORIAL INDEX), `33:140` (02 DETAIL ARCHIVE), `33:147`
(03 MEDIA GALLERY), `33:155` (04 REVIEW ENTRY). The Figma API rate-limited
this token for over an hour and they were never fetched. The index and detail
layouts were built from `03 — Content Systems` plus the component system
instead.

*Consequence:* the section and detail pages are the least design-grounded work
in the project and may need revision. **Read these four frames before treating
those layouts as final.**

**No photography.** Every media plate renders a `PHOTO / HERO`,
`IMAGE / MEDIA`, `SCREENSHOTS` or `BOOK COVER` placeholder. The design
direction is explicitly photography-driven ("photography carries emotion"), so
this is the single largest visual gap. The system is built and waiting for it.

### 2.2 Figma-side problems that are not code

**No published paint or text styles.** Every node carries raw hex; the type
scale exists only as a text label reading `34 / 40 / MEDIUM`. The token layer
is therefore *parsed* out of the Foundations frame, which is inference rather
than a real token source.

*Fix:* publish paint and text styles in Figma and apply them to nodes. Works on
any plan. Figma Variables would be better but reading them over REST requires
Enterprise. Once styles exist, replace `extractFoundations()` in
`scripts/figma-sync.mjs` with a read of the file's `styles` map.

**Two pages disagree on the palette.** `01 — Design Direction` (Foundations)
says `#09090B / #18181B / #27272A / #E4E4E7 / #A1A1AA / #38BDF8`, radius 8/4,
display weight 500. `02 — Homepage` says `#060709 / #0E1013 / #292E36 /
#F0F2F7 / #7A8594 / #2ECCF5`, radius 2, weight 700, and 56px margins instead
of 64px. **Foundations is what the code follows** (decided 2026-09-09). The
Homepage frame needs re-tokenizing in Figma, or the divergence documented as
intentional.

**`Sidebar` and `Sidebar Item` are orphaned components.** The shell uses the
horizontal header from the Homepage frame, so nodes `33:84` and `33:34` are
unused. Retire them in Figma or decide the rail has a future use.

**A minor inconsistency in `Sidebar Item`:** the 2×16px cyan signal bar is
present in *both* Default and Active variants, with only the label colour
differing. Treated as an oversight; the bar is implemented as active-only.

### 2.3 Code-level debt

**The type scale is large** — 11 sans steps (88, 34, 30, 25, 20, 18, 16, 15,
14, 12). That is what the comps use, but more than a system needs. Worth asking
whether 34 / 30 / 25 can collapse to two steps. Not merged unilaterally because
all three are visibly in use.

**Book covers get a landscape plate** in card grids (`aspect-[388/150]`, from
the Editorial Card component). Consistent card rhythm, but a real cover will
crop badly. A portrait media variant on `EditorialCard` is the fix.

**Mono 9px is rendered at 10px.** The Figma nodes use mono at both sizes; both
render at 10px because 9px uppercase mono is below a comfortable reading size.
Deliberate, recorded here so it is not "fixed" by accident.

**`site.external.href` is a guess** — currently `https://github.com/shinigamae`.
Set the real URL in `src/config/site.ts`.

**All content is seed data.** Real where the design supplied it (Astray Gold
Frame, Destiny Gundam, Where Winds Meet); the books and two of three projects
are invented placeholders. Replace them — no code depends on them.

**No sitemap or RSS.** A public archive probably wants both.
`@astrojs/sitemap` and a feed endpoint are small additions.

**The Figma token is in a chat transcript.** Revoke the current personal access
token and issue a fresh one into `.env`; the `.env` setup makes this a one-line
change.

### 2.4 Environment gotchas

These cost real time to diagnose. Do not re-litigate them.

| Symptom | Cause and fix |
| --- | --- |
| `astro dev` exits instantly | Visual Studio holds a lock on `.vs/**/*.vsidx`, crashing Vite's watcher with `EBUSY`. Already excluded in `astro.config.mjs`. The real error lands in `.astro/dev.log`, not the terminal. |
| `astro check` fails to start | TypeScript 7's native compiler does not expose the API the Astro language server needs. `typescript` is pinned to `^6` for this reason — do not bump it. |
| Node cannot verify Figma's certificate | A TLS-inspecting proxy is on this network. Both `figma:*` scripts run `node --use-system-ca`. |
| Figma requests fail intermittently with `ECONNRESET` | Same proxy. `figmaGet()` retries; roughly one request in three fails. |
| Figma returns 429 for a long time | Read-heavy sessions exhaust the quota and `Retry-After` is 60s, sustained. The report is read-only, so nothing is left half-applied. Wait and re-run. |
| A newly added file's Tailwind classes do not apply in dev | Tailwind can serve stale CSS for files created while the dev server is running. Restart `astro dev`. The production build is always correct. |

---

## 3. Next steps

In the order that unblocks the most work.

### 3.1 Immediate

1. **Read the four `Templates — V1` frames** (`npm run figma:check` first to
   confirm the API is answering) and revise the index / detail layouts against
   them. This is the only unfinished work from Step 3.
2. **Publish paint and text styles in Figma**, then reconcile the Homepage
   palette. This converts design sync from inference to fact.
3. **Add photography.** Drop files in `public/` and set `hero`, `gallery`,
   `screenshots`, `cover` in the content JSON. No code changes needed.
4. **Replace the seed content** with real entries.

### 3.2 Then

5. **Decide what Lab is.** This is a design decision, not a code task. It has a
   route, a nav entry and no content model.
6. **Sitemap and RSS.**
7. **Deploy.** Configured and verified locally; see `DEPLOY.md`. Repo is
   public, Pages is on with Source: GitHub Actions, and `base: '/air-chrysalis'`
   is wired through. Ships on the next push to `main`.
8. **Interactive filters on Games and Books**, matching the Builds index. The
   pattern is already proven and progressive-enhancement safe.

### 3.3 Later

9. **The .NET REST API.** `src/content.config.ts` is already the contract —
   the schemas were written to be satisfied by it. `currentStatus` in
   `src/config/home.ts` is the obvious first thing to fetch rather than
   hard-code.
10. **Collapse the type scale** if the designer agrees.
11. **Portrait media variant** on `EditorialCard` for book covers.

---

## 4. Decisions already made

Recorded so they are not silently reversed.

| Decision | Rationale |
| --- | --- |
| Horizontal top nav, not a sidebar rail | User's call, 2026-09-09, following `02 — Homepage` over FIGMA.md's sidebar requirement |
| Foundations palette is canonical | User's call, 2026-09-09, over the Homepage frame's palette |
| `Top Bar` is an optional page-context strip | The chosen shell has no room for it under a horizontal header; Home opts out so the hero sits on the canvas |
| Card internals follow component `33:49`, not the Homepage frame | FIGMA.md makes the component authoritative and forbids one-off variants; the frame puts the kicker above the media, the component puts media first |
| Cards fill the content width with 24px gutters | The frame's card row stops 56px short of its right margin, which reads as hand placement |
| Status-panel divider is a 1px rule | The frame draws it as 32 box-drawing characters, which a screen reader would read aloud |
| Filtering is an inline script, not a React island | No state needs to live in a component tree; all cards ship visible so the page works without JS |
| Explicit `index` / `order` fields for sorting | Sorting by year alone left same-year entries in arbitrary alphabetical order |
| Active nav item gets a cyan underline as well as cyan text | State must not be carried by colour alone |
| Repo stays `air-chrysalis`; site is a project site at a base path | User's call, 2026-09-09 — the *1Q84* reference is deliberate. `withBase`/`stripBase` make the later domain migration a one-line change |
