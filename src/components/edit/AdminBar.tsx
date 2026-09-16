import { useEffect } from 'react';
import { hasBackend } from '@/lib/api';
import { setEditing, startSession, useEditState } from '@/lib/edit-mode';
import { buttonTone } from '@/components/edit/controls';

/**
 * The edit switch, and the only thing on the page that is always mounted.
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
 *
 * Signing *in* is not here and is not admin's business: the header carries one
 * `SIGN IN` for everybody (`layout/SessionControl`), because the account system is
 * about to be for comments and whatever follows them. This rail used to offer
 * `ADMIN · SIGN IN WITH DISCORD` to anyone who scrolled, which told every reader that
 * the site had an administrator and then handed them their door. Nothing here names
 * the role now either — there is one admin, the API decides that from its own
 * configuration on every request, and what the one admin sees for it is a switch.
 */
export default function AdminBar() {
  const { me, editing } = useEditState();

  useEffect(() => {
    startSession();
  }, []);

  // No backend in this build: there is nothing to sign in to and nothing to save to.
  if (!hasBackend) return null;

  // Signed in, but not the admin. There is exactly one admin and it is not this person,
  // so there is nothing to offer them.
  if (!me?.isAdmin) return null;

  return (
    <Rail>
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
