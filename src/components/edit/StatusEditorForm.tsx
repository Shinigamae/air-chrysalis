import { useState } from 'react';
import { putStatus, type SiteStatus } from '@/lib/api';
import { EditRegion } from '@/components/edit/EditRegion';
import { Field, SaveBar, TextInput, useSave } from '@/components/edit/controls';

/**
 * BUILDING and NEXT BUILD — the homepage's CURRENT STATUS panel.
 *
 * PLAN.md Phase 4a names this as the first admin island, and it is the right one:
 * these two are the only genuinely *live* fields on the site. Everything else here is
 * an override waiting for a deploy, but status has its own endpoint, its own table row,
 * and is what `/api/live` exists to carry — so an edit to it is visible to a reader as
 * soon as the live island is wired, without a rebuild.
 *
 * PLAYING and READING are not here, and should not be. The homepage fills them from the
 * collections, because the syncs already know the answer and a hand-typed one goes
 * stale silently — that panel once claimed a game the gaming log had not shown as
 * current for months. Offering a text box for them would be rebuilding exactly that.
 */
export default function StatusEditorForm({ building, nextBuild }: SiteStatus) {
  return (
    <EditRegion
      label="CURRENT STATUS"
      note="LIVE THE MOMENT IT SAVES · THE BAKED PANEL CATCHES UP ON THE NEXT DEPLOY"
      // /api/live is the read side of the same row PUT /api/status writes. There is no
      // GET /api/status, deliberately — one live document, not one endpoint per field.
      load={async () => {
        const response = await fetch(
          `${(import.meta.env.PUBLIC_API_URL ?? '').replace(/\/+$/, '')}/api/live`,
        );
        if (!response.ok) throw new Error('live');
        const live = (await response.json()) as { status?: Partial<SiteStatus> };
        return {
          building: live.status?.building ?? building,
          nextBuild: live.status?.nextBuild ?? nextBuild,
        } satisfies SiteStatus;
      }}
    >
      {(current) => <Form current={current} />}
    </EditRegion>
  );
}

function Form({ current }: { current: SiteStatus }) {
  const [draft, setDraft] = useState<SiteStatus>(current);
  const [save, perform] = useSave();

  const dirty = draft.building !== current.building || draft.nextBuild !== current.nextBuild;

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        <Field label="BUILDING">
          {(id) => (
            <TextInput
              id={id}
              value={draft.building}
              maxLength={200}
              onChange={(building) => setDraft((d) => ({ ...d, building }))}
            />
          )}
        </Field>

        <Field label="NEXT BUILD">
          {(id) => (
            <TextInput
              id={id}
              value={draft.nextBuild}
              maxLength={200}
              onChange={(nextBuild) => setDraft((d) => ({ ...d, nextBuild }))}
            />
          )}
        </Field>
      </div>

      <SaveBar
        save={save}
        dirty={dirty}
        onCancel={() => setDraft(current)}
        onSave={() =>
          void perform(async () => {
            await putStatus(draft);
            // Both fields are plain text in the baked panel, so the page can be brought
            // into line without a reload. This is the DOM patching BACKEND.md §10.4
            // describes for the live island, done by the editor that caused the change.
            patch('building', draft.building);
            patch('next-build', draft.nextBuild);
          })
        }
      />
    </div>
  );
}

/** Updates the baked panel in place, if this page happens to render the field. */
function patch(field: string, value: string): void {
  document.querySelectorAll(`[data-status-field="${field}"]`).forEach((node) => {
    node.textContent = value;
  });
}
