import { useEffect, useState } from 'react';
import { canSignIn, hasBackend, signInDev, startDiscordLogin, ApiError } from '@/lib/api';
import { setMe, signOut, startSession, setEditing, useEditState } from '@/lib/edit-mode';
import { buttonTone } from '@/components/edit/controls';

/**
 * The switch, and the only thing on the page that is always mounted.
 *
 * It sits in a fixed rail at the bottom of the viewport rather than in the header. The
 * header is a designed object with three breakpoint behaviours and a mobile variant
 * that replaces it outright; threading an admin control through all of that would mean
 * editing the shell in four places to add something only one person ever sees. A rail
 * is additive, sits below the content at every width, and is the same control on a
 * phone as on a desktop.
 *
 * **It renders nothing at all** unless `PUBLIC_API_URL` is set (BACKEND.md §10.2) and
 * the API says this visitor is an admin. For everyone else — which is everyone — the
 * component mounts, asks once, gets "no", and returns null for the life of the page.
 */
export default function AdminBar() {
  const { ready, me, editing, error } = useEditState();
  const [signingIn, setSigningIn] = useState(false);
  const [signInError, setSignInError] = useState<string | null>(null);

  useEffect(() => {
    startSession();
  }, []);

  // No backend in this build: there is nothing to sign in to and nothing to save to.
  if (!hasBackend) return null;

  /*
   * Not signed in. The button sends the browser to Discord, which returns to this site
   * with a code, which the site posts to /api/auth/discord/exchange — so the client
   * secret never reaches a browser (BACKEND.md §7).
   */
  if (ready && !me) {
    // Discord where it is configured, the local stand-in where it is not. Nothing
    // at all on a deployed site with neither, because an anonymous reader has no
    // reason to be offered a sign-in for an archive they can already read in full.
    if (!canSignIn && !isLocal()) return null;

    return (
      <Rail>
        <span className="type-micro text-muted">ADMIN</span>
        {canSignIn && (
          <button type="button" onClick={startDiscordLogin} className={buttonTone.signal}>
            SIGN IN WITH DISCORD
          </button>
        )}

        {isLocal() && (
        <button
          type="button"
          disabled={signingIn}
          onClick={async () => {
            setSigningIn(true);
            setSignInError(null);
            try {
              setMe(await signInDev());
            } catch (cause) {
              setSignInError(
                cause instanceof ApiError ? cause.message : 'Could not sign in.',
              );
            } finally {
              setSigningIn(false);
            }
          }}
          className={buttonTone.plain}
        >
          {signingIn ? 'SIGNING IN…' : 'SIGN IN (DEV)'}
        </button>
        )}
        {(signInError ?? error) && (
          <span className="type-micro text-danger">{signInError ?? error}</span>
        )}
      </Rail>
    );
  }

  // Signed in, but not the admin. There is exactly one admin and it is not this person,
  // so there is nothing to offer them.
  if (!me?.isAdmin) return null;

  return (
    <Rail>
      <span className="type-micro text-muted">
        {me.name.toUpperCase()}
        <span className="text-signal"> · ADMIN</span>
      </span>

      <button
        type="button"
        role="switch"
        aria-checked={editing}
        onClick={() => setEditing(!editing)}
        className={editing ? buttonTone.signal : buttonTone.plain}
      >
        <span
          aria-hidden="true"
          className={`inline-block h-1 w-1 rounded-full ${editing ? 'bg-signal' : 'bg-muted'}`}
        />
        EDIT MODE {editing ? 'ON' : 'OFF'}
      </button>

      <button type="button" onClick={signOut} className={buttonTone.plain}>
        SIGN OUT
      </button>

      {editing && (
        <span className="type-micro hidden text-muted sm:inline">
          EDITS SAVE TO THE API AND GO LIVE — THE BAKED PAGE CATCHES UP ON THE NEXT DEPLOY
        </span>
      )}
    </Rail>
  );
}

function Rail({ children }: { children: React.ReactNode }) {
  return (
    <div
      // `print:hidden` because a printed page has no controls on it, and the rail would
      // otherwise land across the bottom of the last sheet.
      className="fixed inset-x-0 bottom-0 z-50 border-t border-line bg-panel/95 backdrop-blur print:hidden"
    >
      <div className="layout-container flex flex-wrap items-center gap-1 py-1">{children}</div>
    </div>
  );
}

/**
 * Whether the dev sign-in is worth offering.
 *
 * The endpoint behind it is blocked in Production by the API regardless, so this is not
 * the fence — it only keeps a button that cannot work off a page where it cannot work.
 */
function isLocal(): boolean {
  if (typeof window === 'undefined') return false;
  const { hostname } = window.location;
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
}
