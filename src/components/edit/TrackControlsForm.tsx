import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ApiError, getHiddenTracks, setTrackHidden } from '@/lib/api';
import { startSession, useEditing } from '@/lib/edit-mode';
import { buttonTone } from '@/components/edit/controls';

/**
 * HIDE on the row you are looking at — the ON ROTATION exclusion list.
 *
 * PLAN.md settled the affordance before the code existed: a denylist inside
 * `spotify-sync.mjs` was built and reverted on 2026-09-14 because the control belongs
 * on the row, not in a JSON file of ids pasted in by hand. This is that control.
 *
 * Why it needs to exist at all (BACKEND.md §2.5): music played for someone else on the
 * account — a bedtime playlist, on repeat — is still listening, and Spotify counts it.
 * Playlist privacy hides the playlist, not the plays, so a nightly repeat ranks high in
 * a four-week window. The exclusion is admin state, so it lives in
 * `content_overrides('music', 'rotation')` as `{ hiddenTrackIds: [...] }`.
 *
 * **Hiding does not re-cut the chart here, and cannot.** `spotify-sync.mjs` over-fetches
 * 50 from Spotify, filters, *then* cuts to the limit — so the row that would replace a
 * hidden one is not on this page to promote. The section is one row shorter until the
 * next sync fills it, which is the honest thing for it to be.
 *
 * ---
 *
 * Rendering: one island, not one per row. It finds each row's `[data-edit-slot]` and
 * portals a button into it. A portal rather than direct DOM writing because React
 * should only ever mutate nodes it owns — and the slot is an empty span that exists for
 * exactly this, sitting beside the `<a>` rather than inside it, since a button nested
 * in an anchor is neither valid nor clickable in the way anyone expects.
 */
export default function TrackControlsForm() {
  const editing = useEditing();
  const [slots, setSlots] = useState<{ id: string; node: Element }[]>([]);
  const [hidden, setHidden] = useState<string[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    startSession();
  }, []);

  // Collect the slots once edit mode is on. Done in an effect rather than at module
  // scope because the island hydrates before nothing in particular — the chart is
  // server-rendered, but the ordering of hydration against it is not ours to assume.
  useEffect(() => {
    if (!editing) {
      setSlots([]);
      return;
    }

    const found = Array.from(document.querySelectorAll('[data-edit-slot][data-id]')).map(
      (node) => ({ id: (node as HTMLElement).dataset.id!, node }),
    );
    setSlots(found);
  }, [editing]);

  useEffect(() => {
    if (!editing) return;
    let cancelled = false;

    getHiddenTracks()
      .then((ids) => {
        if (!cancelled) setHidden(ids);
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setError(
          cause instanceof ApiError
            ? cause.isAuth
              ? 'Not signed in.'
              : cause.message
            : 'Could not read the exclusion list.',
        );
      });

    return () => {
      cancelled = true;
    };
  }, [editing]);

  const toggle = useCallback(
    async (id: string) => {
      if (hidden === null) return;
      const next = !hidden.includes(id);

      setBusy(id);
      setError(null);
      try {
        await setTrackHidden(id, next);
        setHidden((current) =>
          current === null
            ? current
            : next
              ? [...current, id]
              : current.filter((existing) => existing !== id),
        );
        // Dim the row it belongs to. The row is still a real link to Spotify and stays
        // one — this is a preview of the next sync, not a deletion.
        document
          .querySelector(`[data-track][data-id="${CSS.escape(id)}"]`)
          ?.setAttribute('data-hidden', next ? 'true' : 'false');
      } catch (cause) {
        setError(cause instanceof ApiError ? cause.message : 'Could not save.');
      } finally {
        setBusy(null);
      }
    },
    [hidden],
  );

  if (!editing) return null;

  return (
    <>
      {slots.map(({ id, node }) =>
        createPortal(
          <button
            type="button"
            disabled={hidden === null || busy === id}
            onClick={() => void toggle(id)}
            className={hidden?.includes(id) ? buttonTone.signal : buttonTone.plain}
            title={
              hidden?.includes(id)
                ? 'Put this track back in the chart'
                : 'Keep this track out of the chart from the next sync'
            }
          >
            {busy === id ? '…' : hidden?.includes(id) ? 'HIDDEN' : 'HIDE'}
          </button>,
          node,
          id,
        ),
      )}

      {(error ?? hidden !== null) && (
        <div className="mt-2 flex flex-col gap-0.5">
          {error && <p className="type-micro text-danger">{error}</p>}
          {hidden !== null && !error && (
            <p className="type-meta text-muted/70">
              {hidden.length === 0
                ? 'NOTHING HIDDEN. HIDING A TRACK KEEPS IT OUT FROM THE NEXT SYNC ONWARD.'
                : `${hidden.length} TRACK${hidden.length === 1 ? '' : 'S'} HIDDEN · THE CHART REFILLS ON THE NEXT SYNC`}
            </p>
          )}
        </div>
      )}
    </>
  );
}
