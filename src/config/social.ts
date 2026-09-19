/**
 * ELSEWHERE — the homepage's fourth section.
 *
 * Copy and links live here rather than in the template, like
 * `src/config/home.ts` and `src/config/music.ts`, so the section reads as one
 * piece of writing instead of being spelled out across markup.
 *
 * STATUS.md §3.1.6 said these links belonged in `src/config/site.ts` beside
 * `external`, and that note predates ON ROTATION having a module of its own.
 * The intent was "not a content collection for four hand-written links", and
 * this satisfies it: `site.ts` is the one place that knows the brand lockup
 * and the navigation, and burying four brand glyphs in it would have made
 * that file harder to read for no gain.
 *
 * Everything else on the homepage is an archive kept *here*. This section is
 * the opposite — four doors out — and the card built for it says so in its
 * own vocabulary. See `src/components/ui/SocialCard.astro`.
 */

export const section = {
  eyebrow: '04 / ELSEWHERE',
  title: 'WHERE ELSE I AM',
  /**
   * In the same voice as the two sections above it: a smaller claim than the
   * obvious one. "Follow me" asks for something; this only reports where the
   * accounts are, which is all a personal archive has any business saying.
   */
  summary: 'Not an audience. Just the other places I turn up.',
} as const;

export interface Profile {
  /**
   * The accent key, which is also the icon's Simple Icons slug. It resolves
   * to `--color-social-<key>` in `tokens.css`, the same way a section accent
   * resolves to `--color-word-<key>` — one key, named in one place.
   */
  key: string;
  /** The platform, in the site's mono uppercase. */
  name: string;
  /** The account as it reads there: "@shinigamae", or a server's name. */
  handle: string;
  /**
   * The profile URL, where the platform has one.
   *
   * **Optional, because not every account is reachable by link.** Discord is
   * the case that earned this: since the 2023 username change you are found
   * there by typing a username into search, and the only address form that
   * exists is `discord.com/users/<numeric id>` — a username does not resolve
   * in a URL at all. So the Discord card carries a username and no link,
   * which is not a missing feature but the whole of what Discord offers.
   *
   * `SocialCard` renders the two forms differently: with no `href` there is
   * no anchor and no `↗`, because there is nowhere to go and an arrow that
   * goes nowhere is a lie.
   */
  href?: string;
  /** Optional line under the name — what is actually posted there. */
  blurb?: string;
  /**
   * The brand's own mark, as a single 24x24 path.
   *
   * From Simple Icons (simpleicons.org), which publishes these under CC0, so
   * the path is copied in rather than pulled from a package: four glyphs do
   * not earn a dependency, and inlining them means the marks ship in the HTML
   * with no request and no flash of a missing icon.
   */
  mark: string;
}

/**
 * Written in the order they should read, not by importance — the row is four
 * across on a wide screen and there is no ranking implied by it.
 *
 * Discord is a profile link, not a server invite. `discord.com/users/<id>`
 * opens a person; `discord.gg/<code>` joins a community. Either works in the
 * `href` below, but they are different promises, and the handle should say
 * which one a reader is about to take.
 */
export const profiles: Profile[] = [
  {
    key: 'youtube',
    name: 'YOUTUBE',
    handle: '@shinigamae21',
    href: 'https://www.youtube.com/@shinigamae21',
    mark: 'M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z',
  },
  {
    key: 'facebook',
    name: 'FACEBOOK',
    handle: '@shinigamae',
    href: 'https://www.facebook.com/shinigamae',
    mark: 'M9.101 23.691v-7.98H6.627v-3.667h2.474v-1.58c0-4.085 1.848-5.978 5.858-5.978.401 0 .955.042 1.468.103a8.68 8.68 0 0 1 1.141.195v3.325a8.623 8.623 0 0 0-.653-.036 26.805 26.805 0 0 0-.733-.009c-.707 0-1.259.096-1.675.309a1.686 1.686 0 0 0-.679.622c-.258.42-.374.995-.374 1.752v1.297h3.919l-.386 2.103-.287 1.564h-3.246v8.245C19.396 23.238 24 18.179 24 12.044c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.628 3.874 10.35 9.101 11.647Z',
  },
  {
    /*
     * The bird is gone. The mark here is X's, because that is what a reader
     * will land on and a card should not promise a service that no longer
     * answers to the name — but the key stays `x` and the name is the one on
     * the door today. Swap `name` back to 'TWITTER' if you would rather the
     * card said so; nothing else has to change.
     */
    key: 'x',
    name: 'X',
    handle: '@shinigamae',
    href: 'https://x.com/shinigamae',
    mark: 'M14.234 10.162 22.977 0h-2.072l-7.591 8.824L7.251 0H.258l9.168 13.343L.258 24H2.33l8.016-9.318L16.749 24h6.993zm-2.837 3.299-.929-1.329L3.076 1.56h3.182l5.965 8.532.929 1.329 7.754 11.09h-3.182z',
  },
  {
    /*
     * The one address here that is a number rather than a name.
     *
     * Discord has no username URL — since the 2023 username change you are
     * *found* by typing `shinigamae` into search, and the only form that
     * resolves is `discord.com/users/<snowflake id>`. So the card shows the
     * username, which is what a reader would type, and links to the id,
     * which is what a browser can follow. The two are the same account said
     * two ways, and neither says it on its own.
     */
    key: 'discord',
    name: 'DISCORD',
    handle: '@shinigamae',
    href: 'https://discord.com/users/459546639217197087',
    mark: 'M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z',
  },
];

/**
 * The ones with an identity to show.
 *
 * The handle gates a card, not the URL — an account you can only be *found*
 * by is still an account, and that is exactly Discord. A profile with no
 * handle is not rendered, and no profiles at all is not a section: the same
 * rule ON ROTATION follows before the first `npm run music:sync`, because a
 * heading over nothing reads as a bug.
 *
 * GitHub is deliberately absent from the list above. It is the site's own
 * credit link and already sits in the footer as the ↗; a card for it here
 * would be the same address said twice on one page.
 */
export const listedProfiles = (): Profile[] =>
  profiles.filter((profile) => profile.handle.trim() !== '');
