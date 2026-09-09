/**
 * Status vocabulary — Figma "Status Label" (33:41) variants.
 * Lives outside the .astro component so other components can type against it.
 */
export type Status = 'live' | 'archive' | 'draft';

/** Cyan for Live, muted for everything settled. */
export const statusTone: Record<Status, string> = {
  live: 'text-signal',
  archive: 'text-muted',
  draft: 'text-muted',
};
