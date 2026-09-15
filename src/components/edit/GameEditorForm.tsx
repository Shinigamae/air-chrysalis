import { useState } from 'react';
import { getOverride, patchOverride } from '@/lib/api';
import { EditRegion } from '@/components/edit/EditRegion';
import {
  Field,
  NumberInput,
  SaveBar,
  Select,
  TextArea,
  Toggle,
  useSave,
} from '@/components/edit/controls';

/**
 * The editorial half of a game entry.
 *
 * PSN supplies facts and none of the opinion: `rating`, `review` and `screenshots`
 * arrive empty on every import because no API has a view about whether a game was any
 * good. They are override-only fields, which is to say they only ever exist because
 * someone typed them — and until now the only way to type them was to hand-edit
 * `games-overrides.json`.
 *
 * `playStatus` is here for a different reason. The sync infers it — 100% or a platinum
 * is `finished`, a trophy within 60 days is `in-progress`, everything else is `played`
 * — and two of the five values are deliberately unreachable by inference. `abandoned`
 * and `backlog` can only come from an override, because giving up on something is a
 * judgement a person makes, not a sync. The inference used to call that last group
 * `abandoned` on its own and labelled 190 games — most of a decade-old library — as
 * failures on no evidence.
 */

export interface GameEditorProps {
  slug: string;
  /** The baked values, used only as the fallback when nothing overrides them. */
  rating: number | null;
  review: string;
  playStatus: PlayStatus;
  current: boolean;
  status: Status;
}

type PlayStatus = 'in-progress' | 'finished' | 'played' | 'backlog' | 'abandoned';
type Status = 'live' | 'archive' | 'draft';

const PLAY_OPTIONS = [
  { value: 'in-progress', label: 'IN PROGRESS' },
  { value: 'finished', label: 'FINISHED' },
  { value: 'played', label: 'PLAYED' },
  { value: 'backlog', label: 'BACKLOG — override only' },
  { value: 'abandoned', label: 'ABANDONED — override only' },
] as const satisfies readonly { value: PlayStatus; label: string }[];

const STATUS_OPTIONS = [
  { value: 'archive', label: 'ARCHIVE' },
  { value: 'live', label: 'LIVE' },
  { value: 'draft', label: 'DRAFT' },
] as const satisfies readonly { value: Status; label: string }[];

interface Draft {
  rating: number | null;
  review: string;
  playStatus: PlayStatus;
  current: boolean;
  status: Status;
}

export default function GameEditorForm(props: GameEditorProps) {
  return (
    <EditRegion
      label={`EDIT · ${props.slug}`}
      // The stored patch wins over the baked value, because the baked value is as old
      // as the last deploy and the patch may not have been baked yet.
      load={async (): Promise<Draft> => {
        const patch = await getOverride('games', props.slug);
        return {
          rating: pick(patch.rating, props.rating),
          review: pick(patch.review, props.review),
          playStatus: pick(patch.playStatus, props.playStatus),
          current: pick(patch.current, props.current),
          status: pick(patch.status, props.status),
        };
      }}
    >
      {(stored) => <Form slug={props.slug} stored={stored} baked={props} />}
    </EditRegion>
  );
}

function Form({ slug, stored, baked }: { slug: string; stored: Draft; baked: GameEditorProps }) {
  const [draft, setDraft] = useState<Draft>(stored);
  const [save, perform] = useSave();

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const dirty = (Object.keys(stored) as (keyof Draft)[]).some((key) => draft[key] !== stored[key]);

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Field label="RATING" hint="OUT OF 10. EMPTY MEANS UNRATED, WHICH IS NOT A ZERO.">
          {(id) => (
            <NumberInput
              id={id}
              value={draft.rating}
              min={0}
              max={10}
              step={0.5}
              onChange={(rating) => set('rating', rating)}
            />
          )}
        </Field>

        <Field label="PLAY STATUS">
          {(id) => (
            <Select
              id={id}
              value={draft.playStatus}
              options={PLAY_OPTIONS}
              onChange={(playStatus) => set('playStatus', playStatus)}
            />
          )}
        </Field>
      </div>

      <Field label="REVIEW" hint="ONE SENTENCE THAT EARNS ITS PLACE.">
        {(id) => (
          <TextArea
            id={id}
            value={draft.review}
            rows={3}
            onChange={(review) => set('review', review)}
          />
        )}
      </Field>

      <div className="flex flex-wrap items-center gap-3">
        <Toggle
          checked={draft.current}
          onChange={(current) => set('current', current)}
          label="CURRENTLY PLAYING"
        />

        <div className="flex items-center gap-1">
          <span className="type-micro">ENTRY STATUS</span>
          <Select
            value={draft.status}
            options={STATUS_OPTIONS}
            onChange={(status) => set('status', status)}
          />
        </div>
      </div>

      {draft.current && !stored.current && (
        <p className="type-meta text-muted/80">
          THE HOMEPAGE SHOWS ONE CURRENT GAME. IF ANOTHER IS ALREADY FLAGGED, CLEAR IT THERE —
          NOTHING HERE CAN SEE THE REST OF THE COLLECTION.
        </p>
      )}

      <SaveBar
        save={save}
        dirty={dirty}
        onCancel={() => setDraft(stored)}
        onSave={() =>
          void perform(async () => {
            // Only what differs from the *baked* value is sent. A patch is a delta, and
            // writing a field that already matches the import would store a row saying
            // nothing — which is the duplication content_overrides exists to avoid.
            // `null` removes a field from the patch, which is how "stop overriding this"
            // is spelled.
            await patchOverride('games', slug, {
              rating: same(draft.rating, baked.rating) ? null : draft.rating,
              review: same(draft.review, baked.review) ? null : draft.review,
              playStatus: same(draft.playStatus, baked.playStatus) ? null : draft.playStatus,
              current: same(draft.current, baked.current) ? null : draft.current,
              status: same(draft.status, baked.status) ? null : draft.status,
            });

            patchDom('review', draft.review);
            patchDom('rating', draft.rating === null ? '—' : `${draft.rating} / 10`);
            patchDom('play-status', draft.playStatus.replace('-', ' ').toUpperCase());
            patchDom('status', draft.status.toUpperCase());
          })
        }
      />
    </div>
  );
}

/** An override value if there is one, otherwise what the build baked. */
function pick<T>(override: unknown, baked: T): T {
  return override === undefined || override === null ? baked : (override as T);
}

/**
 * Whether a field still agrees with the import. An empty string and an absent value are
 * the same thing for `review`, which is empty on every PSN import.
 */
function same(a: unknown, b: unknown): boolean {
  if (a === '' && (b === '' || b === null || b === undefined)) return true;
  return a === b;
}

function patchDom(field: string, value: string): void {
  document.querySelectorAll(`[data-edit-field="${field}"]`).forEach((node) => {
    node.textContent = value;
  });
}
