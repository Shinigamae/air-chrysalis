// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';

/**
 * Project site: https://shinigamae.github.io/air-chrysalis/
 *
 * When shinigamae.dev is registered, set `site` to it and change this to ''.
 * `withBase()` in src/config/site.ts degrades to identity, so nothing else
 * changes — but redirect targets do have to be built from it by hand, see
 * below.
 */
/*
 * Two hosts, two shapes.
 *
 * GitHub Pages serves this as a *project* site under /air-chrysalis/, so every
 * internal href needs that prefix. Azure Static Web Apps serves it at the root of
 * its own hostname, where the same prefix would 404 every asset on the page.
 *
 * So both come from the environment, defaulting to the Pages values — the shape
 * this repository has always built. The SWA workflow sets them to the root, and
 * when shinigamae.dev is registered it is the same two variables again.
 * `withBase()` in src/config/site.ts degrades to identity when the base is empty,
 * so nothing else in the project has to know which host it is on.
 */
const base = process.env.SITE_BASE ?? '/air-chrysalis';
const site = process.env.SITE_ORIGIN ?? 'https://shinigamae.github.io';

export default defineConfig({
  site,
  base,
  /*
   * /lab became /journeys once the section turned into photography. A static
   * build emits a meta-refresh page, which keeps any link already shared from
   * dead-ending.
   *
   * The target is prefixed manually: Astro applies `base` to the route it
   * matches but not to where it sends you, so a bare '/journeys' here built a
   * redirect to a path that does not exist on Pages.
   */
  redirects: {
    '/lab': `${base}/journeys`,
  },
  /*
   * No sitemap. The site is deliberately not discoverable for now — see the
   * robots meta tag in AppShell — and a sitemap exists only to hand a
   * crawler a list of every URL to visit, which is the opposite of that.
   * Re-add @astrojs/sitemap here when the site should be indexed.
   */
  integrations: [react()],
  vite: {
    plugins: [tailwindcss()],
    /*
     * When this build was baked (BACKEND.md §10.3). It is sent as `since` on
     * /api/live, so the API answers with only what changed *after* this HTML was
     * generated — right after a deploy that is nothing at all.
     *
     * Defined here rather than read from .env because it has to exist in every
     * build, including a local one, and a missing value would be read as the epoch:
     * correct, but it would ask the API for every override ever made on every page
     * view.
     */
    define: {
      'import.meta.env.PUBLIC_BUILD_AT': JSON.stringify(
        process.env.PUBLIC_BUILD_AT ?? new Date().toISOString(),
      ),
      // Which commit this build is, for the settings page. Actions sets GITHUB_SHA;
      // a local build has none and says so.
      'import.meta.env.PUBLIC_BUILD_SHA': JSON.stringify(process.env.GITHUB_SHA ?? ''),
    },
    server: {
      watch: {
        // Visual Studio keeps a lock on .vs/**/FileContentIndex/*.vsidx, which
        // crashes the Vite file watcher with EBUSY on startup. dist/ and
        // .astro/ are build output and would only cause reload churn.
        ignored: [
          '**/.git/**',
          '**/node_modules/**',
          '**/.vs/**',
          '**/dist/**',
          '**/.astro/**',
        ],
      },
    },
  },
});
