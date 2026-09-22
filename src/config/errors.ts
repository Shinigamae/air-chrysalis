/**
 * The fault catalogue.
 *
 * Every error page on the site is the same page with a different row of this
 * table in it — `src/layouts/ErrorPage.astro` renders it, and the pages under
 * `src/pages/error/` are four lines each. Adding a status means adding an entry
 * here and a stub there, and nothing else.
 *
 * Only statuses that can actually happen are listed. There is no 418 and no 410:
 * the first is a joke that stops being funny the second time somebody hits it,
 * and nothing on this site has ever been deliberately removed — `/lab` became
 * `/journeys` through a redirect, which is what a moved page deserves.
 *
 * ---
 *
 * **On the copy.** These pages are read by somebody who has just been stopped,
 * which is the worst moment to be cute at them. Each one says what happened,
 * whose side it happened on, and whether waiting will fix it — in that order,
 * and in as few words as will carry it.
 */

/**
 * What kind of wrong this is. The tone picks the gradient the status code is
 * painted in and whether the page offers a retry, so it is the one field that
 * changes how the page behaves rather than only what it says.
 *
 *   notice  the address is wrong        — cyan → indigo
 *   closed  a door, and it is shut      — violet → fuchsia
 *   strain  come back in a minute       — amber → orange
 *   broken  the machine, not you        — rose → red
 *
 * The four pairs are `--color-fault-<tone>` in tokens.css, read through an
 * inline custom property the same way NavLink reads a section's accent.
 */
export type FaultTone = 'notice' | 'closed' | 'strain' | 'broken';

export interface Fault {
  /** The HTTP status, as a string because it is rendered far more often than compared. */
  code: string;
  /** The status' own name, uppercased — the right half of "404 NOT FOUND". */
  name: string;
  tone: FaultTone;
  /** The <h1>. A sentence, not a label. */
  title: string;
  /** One or two lines under it. What happened, and whether waiting helps. */
  line: string;
  /**
   * Whether the page offers TRY AGAIN.
   *
   * True only where a retry is honestly likely to work: a rate limit that has
   * since lapsed, a process that was restarting, an API that was asleep. On a
   * 404 the button would be a lie — the address will still be wrong.
   */
  retry?: boolean;
}

/**
 * Keyed by status so a page can look itself up by the number in its filename,
 * which is the only thing the two have to agree on.
 */
export const faults = {
  '400': {
    code: '400',
    name: 'BAD REQUEST',
    tone: 'notice',
    title: 'That address does not parse',
    line: 'Something in the URL is malformed — a stray character, a truncated link, a copy that lost its tail. Retyping it is the fix.',
  },

  '401': {
    code: '401',
    name: 'UNAUTHORIZED',
    tone: 'closed',
    title: 'Locked, not hidden',
    line: 'This one wants a sign-in first. Nothing on this site is secret; a few things are simply spoken for.',
  },

  '403': {
    code: '403',
    name: 'FORBIDDEN',
    tone: 'closed',
    title: 'Not yours to open',
    line: 'Signed in, and still not for you. Signing in again will not change the answer.',
  },

  '404': {
    code: '404',
    name: 'NOT FOUND',
    tone: 'notice',
    title: 'Nothing at this address',
    line: 'Moved, renamed, or never written. The archive runs a few hundred pages deep and this is not one of them.',
  },

  '429': {
    code: '429',
    name: 'TOO MANY REQUESTS',
    tone: 'strain',
    title: 'Too many, too quickly',
    line: 'The rate limit did exactly what it is for. Wait a minute and it lapses on its own — there is nothing to fix and nobody to ask.',
    retry: true,
  },

  '500': {
    code: '500',
    name: 'INTERNAL SERVER ERROR',
    tone: 'broken',
    title: 'Something broke on this side',
    line: 'Not your request — the machine behind it. The failure is already in the log; trying again in a moment is a reasonable bet.',
    retry: true,
  },

  '502': {
    code: '502',
    name: 'BAD GATEWAY',
    tone: 'broken',
    title: 'No answer from the back',
    line: 'The API did not reply in time. It sleeps after twenty minutes idle, and the first request after that pays for the whole process starting — which is usually this one.',
    retry: true,
  },

  '503': {
    code: '503',
    name: 'SERVICE UNAVAILABLE',
    tone: 'strain',
    title: 'Temporarily out of service',
    line: 'Deploying, restarting, or catching its breath. This is the one that fixes itself.',
    retry: true,
  },
} as const satisfies Record<string, Fault>;

export type FaultCode = keyof typeof faults;
