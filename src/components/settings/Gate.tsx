import { lazy, Suspense, useEffect } from 'react';
import { startSession, useEditState } from '@/lib/edit-mode';

/**
 * The shell /settings hydrates. It reads one thing — whether the reader is the admin —
 * and for everyone else it renders nothing, so the page stays the 404 it was served as.
 *
 * The panel is a dynamic import for the same reason every editor is (see
 * `lazyEditIsland`): nobody but the admin should download it, and here that matters
 * twice over, because the panel's code is itself a description of the settings.
 */
/*
 * Named `Gate` and `Panel` rather than anything with "settings" in it: Astro names the
 * chunk after the file, and this one's URL is in the HTML every visitor is served.
 */
const SettingsPanel = lazy(() => import('@/components/settings/Panel'));

export default function Gate() {
  const { me } = useEditState();
  const admin = me?.isAdmin === true;

  useEffect(() => {
    startSession();
  }, []);

  useEffect(() => {
    if (!admin) return;
    // The fault markup is the page's real content until now. Hidden rather than
    // removed, so signing out in another tab and coming back leaves a page, not a hole.
    const fault = document.querySelector<HTMLElement>('[data-fault-body]');
    if (fault) fault.hidden = true;
    const title = document.title;
    document.title = 'SETTINGS — SHINIGAMAE';
    return () => {
      if (fault) fault.hidden = false;
      document.title = title;
    };
  }, [admin]);

  if (!admin) return null;

  return (
    <Suspense fallback={<p className="type-meta">LOADING…</p>}>
      <SettingsPanel />
    </Suspense>
  );
}
