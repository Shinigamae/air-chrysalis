/// <reference types="astro/client" />

/**
 * The one environment variable the client reads.
 *
 * `PUBLIC_` is what exposes it to the browser bundle, and an empty value means
 * "no backend" (BACKEND.md §10.2) — every island checks it, renders the baked
 * value, and makes no request. That is the feature flag for the whole admin
 * layer; there is no other one, and nothing below it needs a second.
 */
interface ImportMetaEnv {
  readonly PUBLIC_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
