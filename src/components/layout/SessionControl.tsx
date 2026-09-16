import { useEffect, useState } from 'react';
import {
  ApiError,
  canSignIn,
  canUseDevSignIn,
  hasBackend,
  signInDev,
  startDiscordLogin,
} from '@/lib/api';
import { setMe, signOut, startSession, useEditState } from '@/lib/edit-mode';

/**
 * The site's one door in, in the header where a door belongs.
 *
 * It replaced an `ADMIN · SIGN IN WITH DISCORD` pair in the rail at the bottom
 * of the viewport, and the change is not only where it sits. That rail
 * announced that the site had an administrator and offered the reader the
 * administrator's door — which is both more than a reader needs to know and
 * the wrong invitation, because signing in is about to be for everyone:
 * comments and whatever interaction follows them.
 *
 * So this says `SIGN IN` and nothing else. **Anyone may sign in.** Exactly one
 * account is an admin, the API decides which on every request from its own
 * configuration, and no wording here hints that the distinction exists — an
 * admin's session looks from the outside exactly like anyone else's, because
 * from the outside it is. What an admin additionally gets is the edit rail,
 * which renders only for them (`AdminBar`).
 *
 * `isAdmin` is never read here, deliberately. This component's whole question
 * is "who is signed in", which is a question every visitor is entitled to see
 * the answer to about themselves.
 *
 * Renders nothing when the build has no backend, which is the GitHub Pages
 * mirror: there is nothing to sign in to, and a button that cannot work is
 * worse than no button.
 */
export default function SessionControl() {
  const { ready, me, error } = useEditState();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    startSession();
  }, []);

  if (!hasBackend) return null;

  // Nothing until `/api/me` has answered. The alternative is rendering SIGN IN
  // and swapping it for a name a moment later, which flickers in the header on
  // every navigation for the one person it is wrong for.
  if (!ready) return null;

  if (me) {
    return (
      <div className="flex items-center gap-1.5">
        {me.avatar && (
          <img
            src={me.avatar}
            alt=""
            width={16}
            height={16}
            loading="lazy"
            decoding="async"
            className="h-2 w-2 shrink-0 rounded-full border border-line object-cover"
          />
        )}
        <span className="type-nav max-w-[12ch] truncate text-ink" title={me.name}>
          {me.name.toUpperCase()}
        </span>
        <button type="button" onClick={signOut} className={LINK}>
          SIGN OUT
        </button>
      </div>
    );
  }

  /*
   * Discord where it is configured, the local stand-in where it is not, and
   * nothing at all where neither is — a reader of a build with no provider has
   * no door to be offered.
   */
  const dev = !canSignIn && canUseDevSignIn();
  if (!canSignIn && !dev) return null;

  return (
    <div className="flex items-center gap-1.5">
      {/* A failed identity check, kept to a mark the size of a full stop: the
          reader who needs the sentence can hover it, and it must not push the
          navigation around on a page that is otherwise working. */}
      {(failure ?? error) && (
        <span className="type-nav text-danger" title={failure ?? error ?? ''} aria-hidden="true">
          ·
        </span>
      )}
      <button
        type="button"
        disabled={busy}
        onClick={
          dev
            ? async () => {
                setBusy(true);
                setFailure(null);
                try {
                  setMe(await signInDev());
                } catch (cause) {
                  setFailure(cause instanceof ApiError ? cause.message : 'Could not sign in.');
                } finally {
                  setBusy(false);
                }
              }
            : startDiscordLogin
        }
        className={LINK}
      >
        {busy ? 'SIGNING IN…' : dev ? 'SIGN IN (DEV)' : 'SIGN IN'}
      </button>
    </div>
  );
}

/**
 * The header's own vocabulary, not a button's. It sits in a row of navigation
 * links and should read as one of them — the same `type-nav`, the same muted
 * ink lifting to full on hover.
 */
const LINK =
  'type-nav cursor-pointer border-0 bg-transparent p-0 text-muted ' +
  'transition-colors duration-[var(--duration-base)] ease-[var(--ease-technical)] ' +
  'hover:text-ink disabled:cursor-not-allowed disabled:opacity-40';
