import { lazyEditIsland } from '@/components/edit/lazyEditIsland';

/**
 * HIDE, on the ON ROTATION row you are looking at. The control is fetched when
 * edit mode goes on; until then this island is a boolean read.
 */
// The control takes no props of its own — it finds its rows in the DOM. The type is
// open rather than `Record<string, never>` because Astro's client directives arrive as
// props, and an empty record rejects `client:idle` itself.
export default lazyEditIsland<Record<string, unknown>>(
  () => import('@/components/edit/TrackControlsForm'),
);
