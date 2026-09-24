/**
 * The content syncs, as the settings page describes them.
 *
 * Each row is one step of `.github/workflows/content-sync.yml` and one script under
 * `scripts/`. The `step` is the step's `name:` in that workflow, spelled exactly —
 * the settings page matches a run's steps to these rows by it — so renaming a step
 * there means renaming it here.
 *
 * `reads` is what the script's own defaults say (GOODREADS_USER, FLICKR_USER, the
 * blog's FEED constant). They are repeated rather than imported because the scripts
 * are plain Node and run outside Vite; if one changes, change both.
 */

export interface Integration {
  key: string;
  label: string;
  /** The collection it writes. */
  collection: string;
  /** Where it reads from. */
  reads: string;
  script: string;
  step: string;
  /** The Actions secrets it needs. Empty for a public feed. */
  secrets: readonly string[];
  /** What usually breaks it, in one line. */
  failsWhen: string;
}

export const integrations: readonly Integration[] = [
  {
    key: 'blogspot',
    label: 'BLOGSPOT',
    collection: 'builds',
    reads: 'shinigamae.blogspot.com',
    script: 'npm run blog:sync',
    step: 'Sync build archive from Blogspot',
    secrets: [],
    failsWhen: 'The feed comes back empty.',
  },
  {
    key: 'goodreads',
    label: 'GOODREADS',
    collection: 'books',
    reads: 'goodreads.com · user 61182361',
    script: 'npm run books:sync',
    step: 'Sync reading log from Goodreads',
    secrets: [],
    failsWhen: 'The shelf is made private.',
  },
  {
    key: 'psn',
    label: 'PLAYSTATION NETWORK',
    collection: 'games',
    reads: 'PSN trophies and play time',
    script: 'npm run games:sync',
    step: 'Sync gaming log from PSN',
    secrets: ['PSN_NPSSO'],
    failsWhen: 'The npsso token expires — about every two months.',
  },
  {
    key: 'flickr',
    label: 'FLICKR',
    collection: 'albums',
    reads: 'flickr.com/photos/shinigamae',
    script: 'npm run albums:sync',
    step: 'Sync journeys from Flickr',
    secrets: [],
    failsWhen: 'Flickr changes its markup or shows a bot challenge.',
  },
  {
    key: 'spotify',
    label: 'SPOTIFY',
    collection: 'music',
    reads: 'Spotify Web API · recently played playlists',
    script: 'npm run music:sync',
    step: 'Sync on rotation from Spotify',
    secrets: ['SPOTIFY_CLIENT_ID', 'SPOTIFY_CLIENT_SECRET', 'SPOTIFY_REFRESH_TOKEN'],
    failsWhen: 'The grant is revoked — a password change or removing the app.',
  },
];

/** When the scheduled run starts. The cron in content-sync.yml is `47 10 * * *`. */
export const syncSchedule = 'Daily at 10:47 UTC (17:47 in Ho Chi Minh City)';
