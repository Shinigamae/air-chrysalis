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
const base = '/air-chrysalis';

export default defineConfig({
  site: 'https://shinigamae.github.io',
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
