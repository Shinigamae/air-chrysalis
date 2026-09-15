import { useState } from 'react';
import { deleteContent, putContent, slugify } from '@/lib/api';
import { EditRegion } from '@/components/edit/EditRegion';
import {
  DeleteButton,
  Field,
  NumberInput,
  SaveBar,
  Select,
  StringList,
  TextArea,
  TextInput,
  buttonTone,
  useSave,
} from '@/components/edit/controls';

/**
 * PROJECTS and CLIENTS — the two collections nothing syncs.
 *
 * These are unlike every other editor here. A game or a build has a feed behind it and
 * a person only ever *corrects* it, so the edit is a delta over an imported record.
 * Nobody imports a project. A person is the only author these have ever had, so the
 * edit is the whole record, and it goes to `PUT /api/content/{type}/{slug}` rather than
 * to the override endpoint.
 *
 * That is a real change to the storage boundary and it is worth naming: BACKEND.md §2.3
 * kept these two entirely in JSON on the grounds that "a client's engagement history is
 * exactly the kind of thing that should be reviewed in a diff before it goes live."
 * Editing them here removes that review step. The audit log is what stands in its place
 * — every write records who, when, and the before and after document.
 *
 * Two fields are deliberately not editable. `id` is the slug, and renaming a record
 * through an edit to that record is a rename pretending to be an update: it would
 * orphan anything keyed to the old one. A client's `logo` and `shot` are paths into
 * `src/assets`, which `astro:assets` resizes and re-encodes at build time to emit a
 * srcset — a string typed into a form cannot do that, so changing a logo stays a commit.
 * The server carries all three across an edit rather than exposing them to one.
 */

type Kind = 'projects' | 'clients';
type Status = 'live' | 'archive' | 'draft';

interface Role {
  title: string;
  from: string;
  to?: string;
}

interface Record_ {
  id: string;
  [key: string]: unknown;
}

const STATUS_OPTIONS = [
  { value: 'live', label: 'LIVE' },
  { value: 'archive', label: 'ARCHIVE' },
  { value: 'draft', label: 'DRAFT' },
] as const satisfies readonly { value: Status; label: string }[];

const API = (import.meta.env.PUBLIC_API_URL ?? '').replace(/\/+$/, '');

export interface WorkshopEditorProps {
  kind: Kind;
}

export default function WorkshopEditorForm({ kind }: WorkshopEditorProps) {
  return (
    <EditRegion
      label={kind === 'projects' ? 'PROJECTS' : 'CLIENTS'}
      note="SAVED RECORDS ARE LIVE ON THE API · THIS PAGE RENDERS THEM AFTER THE NEXT DEPLOY"
      load={async () => {
        // pageSize covers both collections whole — there are three projects and four
        // clients, and paging a list this size would be ceremony.
        const response = await fetch(`${API}/api/content/${kind}?pageSize=200&order=index`);
        if (!response.ok) throw new Error('load');
        const page = (await response.json()) as { entries: Record_[] };
        return page.entries;
      }}
    >
      {(records, reload) => <List kind={kind} records={records} reload={reload} />}
    </EditRegion>
  );
}

function List({
  kind,
  records,
  reload,
}: {
  kind: Kind;
  records: Record_[];
  reload: () => void;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  return (
    <div className="flex flex-col gap-1">
      <ul className="m-0 flex list-none flex-col gap-1 p-0">
        {records.map((record) => (
          <li key={record.id} className="rounded-compact border border-line bg-well/60 p-1">
            <div className="flex flex-wrap items-center justify-between gap-1">
              <span className="type-fine min-w-0 truncate">
                {String(record.title ?? record.name ?? record.id)}
              </span>
              <button
                type="button"
                onClick={() => setOpen(open === record.id ? null : record.id)}
                className={open === record.id ? buttonTone.signal : buttonTone.plain}
              >
                {open === record.id ? 'CLOSE' : 'EDIT'}
              </button>
            </div>

            {open === record.id && (
              <div className="mt-2 border-t border-line pt-2">
                <RecordForm
                  kind={kind}
                  record={record}
                  onDone={() => {
                    setOpen(null);
                    reload();
                  }}
                />
              </div>
            )}
          </li>
        ))}
      </ul>

      {adding ? (
        <div className="rounded-compact border border-signal/40 bg-well/60 p-1">
          <p className="type-micro mb-2 text-signal">NEW {kind === 'projects' ? 'PROJECT' : 'CLIENT'}</p>
          <RecordForm
            kind={kind}
            record={null}
            onDone={() => {
              setAdding(false);
              reload();
            }}
          />
        </div>
      ) : (
        <button type="button" onClick={() => setAdding(true)} className={buttonTone.plain}>
          + ADD {kind === 'projects' ? 'PROJECT' : 'CLIENT'}
        </button>
      )}
    </div>
  );
}

/* --- the form ------------------------------------------------------------- */

function RecordForm({
  kind,
  record,
  onDone,
}: {
  kind: Kind;
  record: Record_ | null;
  onDone: () => void;
}) {
  const [draft, setDraft] = useState<Record<string, unknown>>(() => initial(kind, record));
  const [slug, setSlug] = useState(record?.id ?? '');
  const [save, perform] = useSave();

  const set = (key: string, value: unknown) => setDraft((d) => ({ ...d, [key]: value }));
  const str = (key: string) => (typeof draft[key] === 'string' ? (draft[key] as string) : '');
  const arr = (key: string) => (Array.isArray(draft[key]) ? (draft[key] as string[]) : []);

  // On a new record the slug follows the title until someone types their own, which is
  // the behaviour every CMS has and the only one that does not surprise.
  const [slugTouched, setSlugTouched] = useState(record !== null);
  const titleKey = kind === 'projects' ? 'title' : 'name';
  const effectiveSlug = slugTouched ? slug : slugify(str(titleKey));

  return (
    <div className="flex flex-col gap-2">
      {record === null && (
        <Field label="SLUG" hint="THE URL AND THE KEY. IT CANNOT BE CHANGED AFTERWARDS.">
          {(id) => (
            <TextInput
              id={id}
              value={effectiveSlug}
              onChange={(value) => {
                setSlugTouched(true);
                setSlug(slugify(value));
              }}
            />
          )}
        </Field>
      )}

      {kind === 'projects' ? (
        <ProjectFields draft={draft} set={set} str={str} arr={arr} />
      ) : (
        <ClientFields draft={draft} set={set} str={str} arr={arr} />
      )}

      <SaveBar
        save={save}
        dirty
        saveLabel={record === null ? 'CREATE' : 'SAVE'}
        onCancel={onDone}
        onSave={() =>
          void perform(async () => {
            if (!effectiveSlug) throw new Error('A slug is required.');
            await putContent(kind, effectiveSlug, draft);
            onDone();
          })
        }
      >
        {record !== null && (
          <DeleteButton
            label={String(record[titleKey] ?? record.id)}
            onDelete={() =>
              void perform(async () => {
                await deleteContent(kind, record.id);
                onDone();
              })
            }
          />
        )}
      </SaveBar>
    </div>
  );
}

interface FieldProps {
  draft: Record<string, unknown>;
  set: (key: string, value: unknown) => void;
  str: (key: string) => string;
  arr: (key: string) => string[];
}

function ProjectFields({ draft, set, str, arr }: FieldProps) {
  return (
    <>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Field label="TITLE">
          {(id) => <TextInput id={id} value={str('title')} onChange={(v) => set('title', v)} />}
        </Field>
        <Field label="SUBTITLE">
          {(id) => (
            <TextInput id={id} value={str('subtitle')} onChange={(v) => set('subtitle', v)} />
          )}
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Field label="YEAR">
          {(id) => (
            <NumberInput
              id={id}
              value={typeof draft.year === 'number' ? draft.year : null}
              onChange={(v) => set('year', v ?? 0)}
            />
          )}
        </Field>
        <Field label="ORDER" hint="ASCENDING">
          {(id) => (
            <NumberInput
              id={id}
              value={typeof draft.order === 'number' ? draft.order : null}
              min={1}
              onChange={(v) => set('order', v ?? 1)}
            />
          )}
        </Field>
        <Field label="STATUS">
          {(id) => (
            <Select
              id={id}
              value={(str('status') || 'live') as Status}
              options={STATUS_OPTIONS}
              onChange={(v) => set('status', v)}
            />
          )}
        </Field>
        <Field label="LINK">
          {(id) => (
            <TextInput
              id={id}
              value={str('href')}
              placeholder="https://"
              onChange={(v) => set('href', v || undefined)}
            />
          )}
        </Field>
      </div>

      {/* The case-study pattern, in the order the page renders it. */}
      <Field label="PROBLEM">
        {(id) => (
          <TextArea id={id} rows={2} value={str('problem')} onChange={(v) => set('problem', v)} />
        )}
      </Field>
      <Field label="APPROACH">
        {(id) => (
          <TextArea id={id} rows={2} value={str('approach')} onChange={(v) => set('approach', v)} />
        )}
      </Field>
      <Field label="RESULT">
        {(id) => (
          <TextArea id={id} rows={2} value={str('result')} onChange={(v) => set('result', v)} />
        )}
      </Field>

      <Field label="STACK">
        {() => (
          <StringList
            values={arr('stack')}
            onChange={(v) => set('stack', v)}
            placeholder="Add a technology…"
          />
        )}
      </Field>
      <Field label="LESSONS LEARNED">
        {() => (
          <StringList
            values={arr('lessons')}
            onChange={(v) => set('lessons', v)}
            placeholder="Add a lesson…"
          />
        )}
      </Field>
    </>
  );
}

function ClientFields({ draft, set, str, arr }: FieldProps) {
  const roles: Role[] = Array.isArray(draft.roles) ? (draft.roles as Role[]) : [];
  const setRoles = (next: Role[]) => set('roles', next);

  return (
    <>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Field label="NAME">
          {(id) => <TextInput id={id} value={str('name')} onChange={(v) => set('name', v)} />}
        </Field>
        <Field label="INDUSTRY">
          {(id) => (
            <TextInput id={id} value={str('industry')} onChange={(v) => set('industry', v || undefined)} />
          )}
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Field label="SITE">
          {(id) => (
            <TextInput
              id={id}
              value={str('href')}
              placeholder="https://"
              onChange={(v) => set('href', v || undefined)}
            />
          )}
        </Field>
        <Field label="VIA" hint="THE CONSULTANCY HOLDING THE CONTRACT, WHERE IT WAS NOT DIRECT.">
          {(id) => (
            <TextInput id={id} value={str('via')} onChange={(v) => set('via', v || undefined)} />
          )}
        </Field>
      </div>

      <Field label="SUMMARY" hint="TWO SENTENCES AT MOST: WHAT THEY NEEDED, WHAT YOU DID ABOUT IT.">
        {(id) => (
          <TextArea id={id} rows={3} value={str('summary')} onChange={(v) => set('summary', v)} />
        )}
      </Field>

      {/*
        Every title held there, oldest first. One client is often three titles, and
        collapsing that to the last one loses the shape of the engagement. An open `to`
        is what makes a client current — there is no `current` flag, deliberately, so a
        stale LIVE label cannot outlive the end date two lines below it.
      */}
      <Field label="ROLES" hint="LEAVE 'TO' EMPTY WHILE THE ROLE IS CURRENT — THAT IS WHAT MAKES A CLIENT CURRENT.">
        {() => (
          <div className="flex flex-col gap-1">
            {roles.map((role, index) => (
              <div key={index} className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-1">
                <TextInput
                  value={role.title}
                  onChange={(title) =>
                    setRoles(roles.map((r, i) => (i === index ? { ...r, title } : r)))
                  }
                />
                <input
                  type="text"
                  value={role.from}
                  placeholder="YYYY"
                  size={7}
                  onChange={(event) =>
                    setRoles(
                      roles.map((r, i) => (i === index ? { ...r, from: event.target.value } : r)),
                    )
                  }
                  className="type-fine w-8 rounded-compact border border-line bg-well px-1 py-1 text-ink focus:border-signal focus:outline-none"
                />
                <input
                  type="text"
                  value={role.to ?? ''}
                  placeholder="now"
                  size={7}
                  onChange={(event) =>
                    setRoles(
                      roles.map((r, i) =>
                        i === index ? { ...r, to: event.target.value || undefined } : r,
                      ),
                    )
                  }
                  className="type-fine w-8 rounded-compact border border-line bg-well px-1 py-1 text-ink focus:border-signal focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setRoles(roles.filter((_, i) => i !== index))}
                  className={buttonTone.plain}
                  aria-label="Remove role"
                >
                  ×
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => setRoles([...roles, { title: '', from: '' }])}
              className={buttonTone.plain}
            >
              + ADD ROLE
            </button>
          </div>
        )}
      </Field>

      <Field label="STACK">
        {() => (
          <StringList
            values={arr('stack')}
            onChange={(v) => set('stack', v)}
            placeholder="Add a technology…"
          />
        )}
      </Field>

      <p className="type-meta text-muted/70">
        LOGO AND SCREENSHOT ARE BUILD-TIME ASSETS AND ARE CARRIED ACROSS AN EDIT UNTOUCHED.
        CHANGING ONE IS A COMMIT.
      </p>
    </>
  );
}

/* --- defaults ------------------------------------------------------------- */

function initial(kind: Kind, record: Record_ | null): Record<string, unknown> {
  if (record) {
    // `id` is never sent — the server sets it from the route. Sending it back would
    // work, but only because the server ignores it, and a body that carries a field
    // nobody reads is a field someone will later assume is honoured.
    const { id: _id, slug: _slug, ...rest } = record;
    return rest;
  }

  return kind === 'projects'
    ? {
        title: '',
        subtitle: '',
        year: new Date().getFullYear(),
        order: 99,
        problem: '',
        approach: '',
        result: '',
        stack: [],
        lessons: [],
        status: 'live',
      }
    : {
        name: '',
        summary: '',
        roles: [{ title: '', from: '' }],
        stack: [],
      };
}
