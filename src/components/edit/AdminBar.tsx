import { useEffect, useState } from 'react';
import { getSettingsAlerts, hasBackend, type SettingsAlert } from '@/lib/api';
import { withBase } from '@/config/site';
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
  const alerts = useAlerts(me?.isAdmin === true);

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

      {/*
        The only way to /settings. The warning rides on the link rather than in a
        banner of its own: an expiring token is a reason to open settings, so the
        thing that says so is the thing you click.
      */}
      <a
        href={withBase('/settings')}
        title={alerts.map((alert) => alert.message).join('\n') || undefined}
        className={`ml-auto ${alerts.length > 0 ? buttonTone.danger : buttonTone.plain}`}
      >
        {alerts.length > 0 && <span aria-hidden="true">●</span>}
        SETTINGS
        {alerts.length > 0 && (
          <span>
            {' '}
            · {alerts.length === 1 ? alerts[0].message.toUpperCase() : `${alerts.length} NEED ATTENTION`}
          </span>
        )}
      </a>
    </Rail>
  );
}

/*
 * What needs attention, for the admin only, at most once every ten minutes per tab.
 *
 * The API caches the answer for ten minutes too — each one costs it four GitHub calls —
 * but the site is a multi-page app and every click is a fresh document, so without the
 * sessionStorage copy each page view would still be a request. A failure is silent:
 * the rail is not the place to report that the API is down, and the link still works.
 */
const ALERTS_KEY = 'shinigamae.settings-alerts';
const ALERTS_TTL = 10 * 60 * 1000;

function useAlerts(admin: boolean): SettingsAlert[] {
  const [alerts, setAlerts] = useState<SettingsAlert[]>([]);

  useEffect(() => {
    if (!admin) return;

    try {
      const cached = JSON.parse(sessionStorage.getItem(ALERTS_KEY) ?? 'null');
      if (cached && Date.now() - cached.at < ALERTS_TTL) {
        setAlerts(cached.alerts);
        return;
      }
    } catch {
      /* Private mode or a malformed entry; ask the API. */
    }

    let live = true;
    getSettingsAlerts()
      .then((next) => {
        if (!live) return;
        setAlerts(next);
        try {
          sessionStorage.setItem(ALERTS_KEY, JSON.stringify({ at: Date.now(), alerts: next }));
        } catch {
          /* Private mode. It asks again next page, which is only slower. */
        }
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [admin]);

  return alerts;
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
