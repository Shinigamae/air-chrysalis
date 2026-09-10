/**
 * Platform vocabulary for the Gaming Log.
 *
 * PSN reports a trophy set's platforms as one string — "PS4", or
 * "PS3 / PSVITA / PS4" where a set spans generations. Rendered as one grey
 * line that was unreadable at card size: three machines and two slashes in
 * 11px muted mono. So it is split and each machine gets its own chip, tinted
 * with its own colour token.
 *
 * Tone strings live here rather than in the component for the same reason
 * `statusTone` does — so anything rendering a platform agrees on its colour.
 */

export interface PlatformTag {
  /** What the chip reads. Not always the PSN token: "PSVITA" → "PS VITA". */
  label: string;
  /** Full name, for the chip's title/aria text. */
  name: string;
  /** Tailwind text / border / fill classes for the chip. */
  tone: string;
}

/**
 * Written out in full so Tailwind's scanner can see every class. The fill is
 * kept at ~10% and the border at ~40%: the chip is a tint, not a button, and
 * at 20-odd per screen anything heavier turns the grid into confetti.
 */
const PLATFORMS: Record<string, PlatformTag> = {
  PS5: {
    label: 'PS5',
    name: 'PlayStation 5',
    tone: 'border-ps5/35 bg-ps5/10 text-ps5',
  },
  PS4: {
    label: 'PS4',
    name: 'PlayStation 4',
    tone: 'border-ps4/45 bg-ps4/12 text-ps4',
  },
  PS3: {
    label: 'PS3',
    name: 'PlayStation 3',
    tone: 'border-ps3/30 bg-ps3/8 text-ps3',
  },
  PSVITA: {
    label: 'PS VITA',
    name: 'PlayStation Vita',
    tone: 'border-psvita/40 bg-psvita/10 text-psvita',
  },
  PSPC: {
    label: 'PC',
    name: 'PlayStation on PC',
    tone: 'border-pspc/30 bg-pspc/8 text-pspc',
  },
};

/**
 * Split a PSN platform string into chips. An unknown token still renders —
 * PSN can invent one at any time — just in the neutral panel tone.
 */
export function platformsOf(platform: string): PlatformTag[] {
  return platform
    .split('/')
    .map((token) => token.trim().toUpperCase())
    .filter(Boolean)
    .map(
      (key) =>
        PLATFORMS[key] ?? {
          label: key,
          name: key,
          tone: 'border-line bg-well text-muted',
        },
    );
}
