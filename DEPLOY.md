# Deploying SHINIGAMAE.DEV to GitHub Pages

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

**A `robots.txt` in this repository would not work,** which is why there
isn't one. `robots.txt` is only read at the origin root — here that is
`https://shinigamae.github.io/robots.txt`, which is served by the
**`shinigamae.github.io` repository**, not this one. Anything committed to
`public/` lands at `/air-chrysalis/robots.txt`, a path no crawler consults.
The meta tag needs no such cooperation: it travels with the page.

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

## Migrating to shinigamae.dev later

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
