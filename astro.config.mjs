// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  // Project site: https://shinigamae.github.io/air-chrysalis/
  // When shinigamae.dev is registered, set site to it and delete `base`.
  // `withBase()` in src/config/site.ts degrades to identity, so nothing else changes.
  site: 'https://shinigamae.github.io',
  base: '/air-chrysalis',
  integrations: [react(), sitemap()],
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
