# Deploying SHINIGAMAE to GitHub Pages

Last updated: 2026-09-09

Live URL: **https://shinigamae.github.io/air-chrysalis/**

## How this works (and what not to do)

There is **no `gh-pages` branch and no `docs/` folder**. That was how Pages
worked before 2022 and it is no longer the right approach — it meant committing
build output, which goes stale and pollutes history.

Instead, `.github/workflows/deploy.yml` builds the site on every push to `main`
and uploads `dist/` straight to Pages as an artifact. `dist/` stays gitignored
and never enters a commit.

The workflow runs `npm run check` before `npm run build`, so a content entry
that violates its schema fails the deploy rather than shipping a blank page.
`workflow_dispatch` is enabled, so you can also re-deploy from the Actions tab
without pushing.

Action versions were verified current on 2026-09-09: `checkout@v7`,
`setup-node@v7`, `configure-pages@v6`, `upload-pages-artifact@v5`,
`deploy-pages@v5`. All five of the initially-guessed versions were stale, so
check them against the API rather than trusting a template.

> `withastro/action` also exists and bundles install + build + upload. The
> explicit steps are used here so the `astro check` gate is visible and can
> fail the deploy on its own.

---

## Setup status

Both original blockers are **resolved** (2026-09-09):

- The repository was made **public**, so Pages will serve it. (On GitHub Free,
  Pages does not serve private repositories.)
- Pages was enabled with **Source: GitHub Actions** — confirmed via the API as
  `build_type: "workflow"`, `https_enforced: true`.

The repo keeps the name **`air-chrysalis`** — the book-within-a-book from
Murakami's *1Q84*, a deliberate choice rather than a leftover.

One thing to know for future sessions: the `gh` CLI on this machine is
authenticated as `ntkhanh-tma`, which has `WRITE` — enough to push and trigger
the workflow, not enough to administer the repo. Anything needing `ADMIN`
(renaming, Pages settings, visibility) must be done by the `Shinigamae` owner,
most easily in the web UI.

---

## The base path

This is a **project site**, so it serves from a subpath rather than the domain
root:

```js
// astro.config.mjs
site: 'https://shinigamae.github.io',
base: '/air-chrysalis',
```

Astro does **not** rewrite root-absolute links, so two helpers in
`src/config/site.ts` carry the base:

- **`withBase(path)`** — prefixes every internal href and asset URL.
- **`stripBase(pathname)`** — removes it *before* route matching, because
  `Astro.url.pathname` includes the base while the route constants do not.
  `entryFor()` calls this itself, and `AppShell` strips once at the boundary so
  everything downstream reasons about logical routes only.

Forgetting `stripBase` is the subtle failure mode: the page still renders and
still looks correct, but nav active states and page metadata silently go blank.

**Neither helper is throwaway work.** With no `base` both are identity
functions, so migrating to a custom domain later is deleting one config line.

### Adding new links

Always `href={withBase('/some/path')}`, never `href="/some/path"`. Audit with:

```sh
grep -rn 'href="/' src/ | grep -v 'href="http'   # should return nothing
grep -rn 'src="/'  src/                          # should return nothing
```

And after building, nothing should come back from:

```sh
grep -rhoE 'href="/[^"]*"' dist --include="*.html" | grep -v '^href="/air-chrysalis'
```

---

## Verified locally before first deploy

`astro preview` respects `base`, so the built site can be exercised at the real
path. Confirmed on 2026-09-09:

- `/` returns 404 and `/air-chrysalis/` returns 200 — correct for a project site.
- All 17 pages build; 9 representative routes return 200 under the base.
- Every link and asset in `dist/` carries the `/air-chrysalis` prefix; zero
  root-absolute leftovers.
- Real click-through with a headless browser: home → builds → build detail →
  back, each landing on the right URL with the right `h1`, the correct active
  nav item, and CSS applied (`background: rgb(9, 9, 11)`).
- The builds status filter still works under the base.

---

## Deploying

Push to `main`. The workflow does the rest.

```sh
git add -A
git commit -m "Add content layer, section pages, and GitHub Pages deployment"
git push origin main
```

Then watch it:

```sh
gh run watch          # follow the active run
gh run list --limit 5 # recent runs
gh run view --log-failed   # logs, if it fails
```

First run takes a couple of minutes (npm install dominates; the cache warms
after that).

---

## Keeping it out of search results

The site is deployed but deliberately not indexed. One tag does that, in
`src/layouts/AppShell.astro`:

```html
<meta name="robots" content="noindex, nofollow" />
```

**A `robots.txt` does nothing on Pages,** which is why the meta tag is the
one that carries this. `robots.txt` is only read at the origin root — on
Pages that is `https://shinigamae.github.io/robots.txt`, served by the
**`shinigamae.github.io` repository**, not this one, and anything in
`public/` lands at `/air-chrysalis/robots.txt`, a path no crawler consults.
The meta tag needs no such cooperation: it travels with the page.

On Static Web Apps the site *is* the origin root, so `public/robots.txt` is
served where a crawler will read it and says the same thing. The generated
`staticwebapp.config.json` adds `X-Robots-Tag: noindex, nofollow` as a header
besides, which covers `/rss.xml` and everything else that is not an HTML page
and so has nowhere to put a meta tag.

`@astrojs/sitemap` was removed for the same reason — a sitemap exists only to
hand a crawler the list of all 483 URLs.

Two limits worth knowing:

- `noindex` asks a crawler not to *index*; it does not stop it *fetching*.
  To stop the fetching too, add `Disallow: /air-chrysalis/` to the robots.txt
  in the `shinigamae.github.io` repository, which is the one served at the
  root.
- The RSS feed at `/rss.xml` is still linked from every page and is still a
  discovery surface. It stays because it is a feature rather than an SEO
  artifact — delete the `<link rel="alternate">` in AppShell if that changes.

**To make the site public:** delete the meta tag, re-add
`@astrojs/sitemap` to `astro.config.mjs`, and remove any `Disallow` added
above.

---

## Migrating to a custom domain later

`shinigamae.dev` is written out below as the example. **The TLD is not decided**
— `.dev` or `.com`, open as of 2026-09-16 — so substitute whichever is
registered; nothing in these steps depends on which it is.

When the domain is registered:

1. In `astro.config.mjs`, set `site: 'https://shinigamae.dev'` and **delete the
   `base` line**. No other code changes — the helpers become identity functions.
2. Add `public/CNAME` containing exactly `shinigamae.dev`.
3. DNS at the registrar:

   ```
   A     @    185.199.108.153
   A     @    185.199.109.153
   A     @    185.199.110.153
   A     @    185.199.111.153
   CNAME www  shinigamae.github.io
   ```

4. Settings → Pages → Custom domain → `shinigamae.dev`, then enable **Enforce
   HTTPS** once the certificate is issued (can take a few minutes).

Verify the apex IPs against GitHub's current documentation at the time — they
have changed before.

On a custom domain the site owns its own origin, so `public/robots.txt` starts
working — at which point it becomes the better place to express whatever the
crawl policy is by then.

---

## Troubleshooting

| Symptom | Cause |
| --- | --- |
| Page loads unstyled, links 404 | `base` does not match the repo name. It must be `/air-chrysalis` exactly, no trailing slash. |
| Page renders but nav highlights nothing | A path was matched without `stripBase`. |
| Deploy succeeds, site 404s | Pages Source is not set to "GitHub Actions", or the repo went private again. |
| Workflow fails at `npm run check` | A content entry violates its schema. Run `npm run check` locally for the exact field. |
| Workflow fails with a permissions error | The `permissions:` block in the workflow was altered; Pages needs `pages: write` and `id-token: write`. |

---

## Headers and caching on Static Web Apps

Pages serves whatever headers GitHub decides to send and cannot be told
otherwise. Static Web Apps reads `staticwebapp.config.json` from the root of
the uploaded artifact, which is why the SWA deployment is the one that gets a
security posture at all — and one more reason it is the host that stays.

The file is **generated**, by `scripts/swa-config.mjs`, as the last step of
`npm run build`. It is not committed, and it should not be: the
Content-Security-Policy names the SHA-256 of every inline `<script>` in the
build, and a hash maintained by hand is a hash that is right until someone
edits a comment inside the theme bootstrap — after which the site loads with
its theme switch silently dead and nothing failing anywhere a person would
look. Reading the hashes out of `dist/` means the policy cannot drift from
what it is a policy about. Today that is seven scripts across 481 pages: six
site-wide, one on the homepage.

What it sets:

- **CSP.** `script-src` is `'self'` plus those hashes — no `'unsafe-inline'`,
  which is the directive that matters and the reason the generation is worth
  it. `style-src` does keep `'unsafe-inline'`, because several components set
  a `style` attribute to hand CSS a custom property and a style *attribute*
  cannot be hashed. `img-src` and `frame-src` name the hosts the synced
  content actually points at rather than a blanket `https:`, so a field
  somebody edits cannot become a request to somewhere new. `connect-src`
  names the API, taken from `PUBLIC_API_URL` at build time — a build with no
  API allows no cross-origin call at all.
- **HSTS**, two years with subdomains. Not `preload`: that is a submission to
  a list which is painful to leave, and the domain is not settled.
- `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`,
  `X-Frame-Options: DENY`, `Cross-Origin-Opener-Policy`, `X-Robots-Tag`.
- **Caching.** `/_astro/*` is fingerprinted — the filename contains a hash of
  the contents, so a changed file is a changed URL — which is the one case
  `immutable` is honest about: a year, no revalidation. The fonts are in
  there too. HTML is `max-age=0, must-revalidate`: kept and confirmed with a
  304 rather than downloaded again. It cannot be cached for longer, because
  every page carries the build stamp the live layer sends as `since`, and a
  browser holding yesterday's HTML would ask the API what changed since
  yesterday's build.
- **Real error pages.** Without `responseOverrides`, Static Web Apps answers
  an unknown path with `index.html` and a **200** — every typo becomes a
  second copy of the homepage at its own URL. See below.

### If the site breaks after a deploy and the console says CSP

Something now loads from a host the policy does not name, or an inline script
appeared that the generator did not see. Look at the console's report — it
names the directive and the blocked URL — then add the host to `IMAGE_HOSTS`
or `FRAME_HOSTS` in `scripts/swa-config.mjs`. A new inline script needs no
edit at all; rebuilding picks up its hash.

---

## The error pages

Eight of them, one per status that can actually happen here. They are one
layout and eight four-line stubs:

| | Route | Tone | Retry |
| --- | --- | --- | --- |
| `400` | `/error/400/` | notice | |
| `401` | `/error/401/` | closed | |
| `403` | `/error/403/` | closed | |
| `404` | `/404.html` | notice | |
| `429` | `/error/429/` | strain | ✓ |
| `500` | `/error/500/` | broken | ✓ |
| `502` | `/error/502/` | broken | ✓ |
| `503` | `/error/503/` | strain | ✓ |

- `src/config/errors.ts` is the catalogue — code, name, tone, headline, the
  line under it, and whether a retry is honest. Everything that differs
  between the eight is a row of it.
- `src/layouts/ErrorPage.astro` is the page. Adding a status is a row there
  and a stub under `src/pages/error/`.
- `src/pages/404.astro` is the exception, and has to be: Astro special-cases
  that filename and builds it flat as `dist/404.html`, which is also what the
  dev server shows for an unknown route. Its siblings are ordinary routes, so
  they are `/error/<code>/index.html`. That asymmetry is in the built output,
  which is why it is in the `responseOverrides` paths too.

**Four tones, not eight colours.** What a reader needs at a glance is not
which number they hit but which of four situations they are in — the address
is wrong (cyan), a door is shut (violet), come back in a minute (amber), the
machine is broken (rose). Three of the four are borrowed from the section
accents the hero and the header already use, so an error page reads as the
same site; the fourth is the danger rose, the only colour here that has ever
meant something is wrong. Both themes carry a pair, in `tokens.css` and
`theme-light.css` beside the section accents.

**The diagnostic panel** prints the path actually asked for, which on a 404 is
very often the whole diagnosis. It has to be filled in by the client — this is
a static build, so `/404.html` is written once and served for every wrong
address — and the script that does it is four lines of `textContent`. Both
fields rest at an em dash, which is the correct answer when the script has not
run rather than a placeholder for one. `BUILT` is `PUBLIC_BUILD_AT`, the same
stamp the live layer sends as `since`.

### What Static Web Apps can and cannot serve

`responseOverrides` covers **400, 401, 403 and 404 only** — there is no 5xx
override, and for a static host there is nothing that would produce one
anyway. So:

- 400/401/403/404 are wired and will be served with the right status.
- 429, 500, 502 and 503 are built and reachable at their routes, but nothing
  on this host will ever return them by itself. They are destinations — for
  the API to point at, for a future front door to use, and so the copy exists
  and has been looked at before the day it is needed.
- 401 and 403 will not fire today either: no route here is role-protected.
  They are wired so that the day one is, the refusal already looks like the
  site rather than like Azure's default page.

Every one of them is browsable directly, which is how to check they still look
right after a design change.
