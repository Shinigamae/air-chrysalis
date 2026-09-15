import { useEffect, useState, type ReactNode } from 'react';
import { ApiError } from '@/lib/api';
import { startSession, useEditing } from '@/lib/edit-mode';
import { EditPanel } from '@/components/edit/controls';

/**
 * The wrapper every editable region shares.
 *
 * It exists to make one thing true everywhere: **an editor shows what the server holds,
 * not what the page was built with.**
 *
 * That distinction is the whole shape of this feature right now. The site is still a
 * static build — it reads its JSON at build time and has not been switched over to the
 * API — so a value saved here is live on the server and will not appear in the HTML
 * until the next deploy bakes it in. An editor pre-filled from the baked page would
 * therefore show a stale value, and worse, saving it would silently overwrite a newer
 * edit with an older one. So every region loads its own current state when it opens,
 * and says plainly where that state is.
 *
 * Renders nothing at all unless an admin has the switch on, which means the cost to a
 * visitor is this component mounting, reading a boolean, and returning null.
 */
export function EditRegion<T>({
  label,
  load,
  children,
  note = 'SAVED HERE GOES LIVE IMMEDIATELY · THIS PAGE SHOWS IT AFTER THE NEXT DEPLOY',
  actions,
}: {
  label: string;
  /** Fetches the region's current server state. Runs once, when the region opens. */
  load: () => Promise<T>;
  children: (state: T, reload: () => void) => ReactNode;
  note?: string;
  actions?: ReactNode;
}) {
  const editing = useEditing();

  useEffect(() => {
    startSession();
  }, []);

  if (!editing) return null;
  return (
    <div className="mt-3">
      <EditPanel label={label} actions={actions}>
        <Loader load={load} note={note}>
          {children}
        </Loader>
      </EditPanel>
    </div>
  );
}

function Loader<T>({
  load,
  note,
  children,
}: {
  load: () => Promise<T>;
  note: string;
  children: (state: T, reload: () => void) => ReactNode;
}) {
  const [state, setState] = useState<
    { phase: 'loading' } | { phase: 'ready'; value: T } | { phase: 'error'; message: string }
  >({ phase: 'loading' });

  // `nonce` is what makes reload work: a child calls it after a save that changed
  // something the region derives from, and the effect runs again.
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState({ phase: 'loading' });

    load()
      .then((value) => {
        if (!cancelled) setState({ phase: 'ready', value });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setState({
          phase: 'error',
          message:
            error instanceof ApiError
              ? error.isAuth
                ? 'Not signed in, or not an admin.'
                : error.message
              : 'Could not load the current values.',
        });
      });

    // Guards against a save landing after the region closed, and against the double
    // effect invocation React runs in development.
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nonce]);

  if (state.phase === 'loading') {
    return <p className="type-meta">LOADING CURRENT VALUES…</p>;
  }

  if (state.phase === 'error') {
    return (
      <div className="flex flex-col gap-1">
        <p className="type-fine text-danger">{state.message}</p>
        <button
          type="button"
          onClick={() => setNonce((n) => n + 1)}
          className="type-micro cursor-pointer self-start rounded-compact border border-line bg-panel px-1 py-0.5 text-muted hover:text-ink"
        >
          RETRY
        </button>
      </div>
    );
  }

  return (
    <>
      {children(state.value, () => setNonce((n) => n + 1))}
      <p className="type-meta mt-2 text-muted/70">{note}</p>
    </>
  );
}
