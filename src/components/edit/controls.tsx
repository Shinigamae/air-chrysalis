import { useCallback, useId, useState, type ReactNode } from 'react';
import { ApiError } from '@/lib/api';
import { describeSave, type SaveState } from '@/lib/edit-mode';

/**
 * The form vocabulary edit mode is built from.
 *
 * Every control here is written in the site's own language rather than the browser's:
 * mono micro labels, 1px rules, panel ground, cyan only where something is active. The
 * point is that turning edit mode on should look like the site growing controls, not
 * like a settings dialog landing on top of it.
 *
 * None of these are exported to the rest of the site. They exist for the four editors
 * beside them and are deliberately not general — a shared input library that serves one
 * feature is a shared input library with one caller and twice the surface.
 */

/* --- shared class strings -------------------------------------------------
 *
 * Written out in full, never interpolated. Tailwind scans source as text, so a class
 * name built from a variable is a class name that never reaches the stylesheet —
 * `EditorialCard` and `Rotation` both carry the same warning.
 */

const FIELD =
  'w-full rounded-compact border border-line bg-well px-1 py-1 text-ink ' +
  'transition-colors duration-[var(--duration-base)] ease-[var(--ease-technical)] ' +
  'focus:border-signal focus:outline-none placeholder:text-muted/60';

const BUTTON =
  'type-micro inline-flex h-4 cursor-pointer items-center gap-0.5 rounded-compact ' +
  'border px-1 transition-colors duration-[var(--duration-base)] ease-[var(--ease-technical)] ' +
  'disabled:cursor-not-allowed disabled:opacity-40';

export const buttonTone = {
  plain: `${BUTTON} border-line bg-panel text-muted hover:border-muted hover:text-ink`,
  signal: `${BUTTON} border-signal/50 bg-signal/10 text-signal hover:bg-signal/20`,
  danger: `${BUTTON} border-danger/45 bg-danger/10 text-danger hover:bg-danger/20`,
} as const;

/* --- layout --------------------------------------------------------------- */

/**
 * The frame every editor sits in. A cyan hairline rather than a heavy border: the panel
 * has to read as "this region is editable" while the content inside it stays the thing
 * you are looking at.
 */
export function EditPanel({
  label,
  children,
  actions,
}: {
  label: string;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <section className="rounded-standard border border-signal/30 bg-panel/60 p-2">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-1">
        <p className="type-micro text-signal">{label}</p>
        {actions}
      </div>
      {children}
    </section>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: (id: string) => ReactNode;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-0.5">
      <label htmlFor={id} className="type-micro">
        {label}
      </label>
      {children(id)}
      {hint && <p className="type-meta text-muted/80">{hint}</p>}
    </div>
  );
}

/* --- inputs --------------------------------------------------------------- */

export function TextInput({
  id,
  value,
  onChange,
  placeholder,
  maxLength,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  maxLength?: number;
}) {
  return (
    <input
      id={id}
      type="text"
      value={value}
      maxLength={maxLength}
      placeholder={placeholder}
      onChange={(event) => onChange(event.target.value)}
      className={`type-fine ${FIELD}`}
    />
  );
}

export function TextArea({
  id,
  value,
  onChange,
  rows = 3,
  placeholder,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  placeholder?: string;
}) {
  return (
    <textarea
      id={id}
      value={value}
      rows={rows}
      placeholder={placeholder}
      onChange={(event) => onChange(event.target.value)}
      className={`type-fine resize-y ${FIELD}`}
    />
  );
}

export function NumberInput({
  id,
  value,
  onChange,
  min,
  max,
  step = 1,
}: {
  id?: string;
  value: number | null;
  onChange: (value: number | null) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <input
      id={id}
      type="number"
      inputMode="decimal"
      value={value ?? ''}
      min={min}
      max={max}
      step={step}
      // Empty is a real value here and means "unrated", which is not the same as zero.
      // Every rating on this site is nullable for exactly that reason.
      onChange={(event) => {
        const raw = event.target.value;
        onChange(raw === '' ? null : Number(raw));
      }}
      className={`type-fine tabular-nums ${FIELD}`}
    />
  );
}

export function Select<T extends string>({
  id,
  value,
  options,
  onChange,
}: {
  id?: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <select
      id={id}
      value={value}
      onChange={(event) => onChange(event.target.value as T)}
      className={`type-fine cursor-pointer ${FIELD}`}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value} className="bg-panel text-ink">
          {option.label}
        </option>
      ))}
    </select>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}) {
  return (
    <label className="type-micro flex cursor-pointer items-center gap-1 text-muted hover:text-ink">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-2 w-2 cursor-pointer accent-[var(--color-signal)]"
      />
      {label}
    </label>
  );
}

/**
 * A string array, edited as a list of chips with one input on the end.
 *
 * `stack` and `lessons` are both arrays of short strings, and a textarea split on
 * newlines was the first version of this — it lost a lesson every time someone typed a
 * blank line, and it gave no sign that order mattered. Discrete rows cannot do either.
 */
export function StringList({
  values,
  onChange,
  placeholder,
}: {
  values: string[];
  onChange: (values: string[]) => void;
  placeholder: string;
}) {
  const [draft, setDraft] = useState('');

  const add = useCallback(() => {
    const value = draft.trim();
    if (!value) return;
    onChange([...values, value]);
    setDraft('');
  }, [draft, onChange, values]);

  return (
    <div className="flex flex-col gap-1">
      {values.length > 0 && (
        <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
          {values.map((value, index) => (
            <li key={`${value}-${index}`} className="flex items-start gap-1">
              <span className="type-fine min-w-0 flex-1 break-words">{value}</span>
              <button
                type="button"
                onClick={() => onChange(values.filter((_, i) => i !== index))}
                className={buttonTone.plain}
                aria-label={`Remove ${value}`}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-center gap-1">
        <input
          type="text"
          value={draft}
          placeholder={placeholder}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            // Enter adds a row. Without this the form's default submit would fire and
            // the half-typed entry would be saved as nothing.
            if (event.key !== 'Enter') return;
            event.preventDefault();
            add();
          }}
          className={`type-fine ${FIELD}`}
        />
        <button type="button" onClick={add} disabled={!draft.trim()} className={buttonTone.plain}>
          ADD
        </button>
      </div>
    </div>
  );
}

/* --- saving --------------------------------------------------------------- */

/**
 * The save state machine, in one place.
 *
 * Every editor needs the same four states and the same error handling, and the part
 * worth writing once is the last one: an `ApiError` already carries a sentence a person
 * can read, and anything else is a bug that should say so rather than be swallowed into
 * "Something went wrong".
 */
export function useSave(): [SaveState, (run: () => Promise<unknown>) => Promise<boolean>] {
  const [save, setSave] = useState<SaveState>({ status: 'idle' });

  const perform = useCallback(async (run: () => Promise<unknown>) => {
    setSave({ status: 'saving' });
    try {
      await run();
      setSave({ status: 'saved' });
      // Long enough to be read, short enough that it is gone before the next edit.
      setTimeout(() => setSave({ status: 'idle' }), 2200);
      return true;
    } catch (error) {
      const message =
        error instanceof ApiError
          ? error.isAuth
            ? 'NOT SIGNED IN — sign in again'
            : `${error.message}`.toUpperCase()
          : 'SAVE FAILED';
      setSave({ status: 'error', message });
      return false;
    }
  }, []);

  return [save, perform];
}

export function SaveBar({
  save,
  onSave,
  onCancel,
  dirty,
  saveLabel = 'SAVE',
  children,
}: {
  save: SaveState;
  onSave: () => void;
  onCancel?: () => void;
  dirty: boolean;
  saveLabel?: string;
  children?: ReactNode;
}) {
  const note = describeSave(save);

  return (
    <div className="mt-2 flex flex-wrap items-center gap-1 border-t border-line pt-2">
      <button
        type="button"
        onClick={onSave}
        disabled={!dirty || save.status === 'saving'}
        className={buttonTone.signal}
      >
        {saveLabel}
      </button>

      {onCancel && (
        <button
          type="button"
          onClick={onCancel}
          disabled={save.status === 'saving'}
          className={buttonTone.plain}
        >
          CANCEL
        </button>
      )}

      {children}

      {note && (
        <span
          // aria-live so the outcome reaches a screen reader: the visible change is a
          // word appearing beside a button that already had focus, which is otherwise
          // announced as nothing at all.
          aria-live="polite"
          className={`type-micro ${save.status === 'error' ? 'text-danger' : 'text-signal'}`}
        >
          {note}
        </span>
      )}
    </div>
  );
}

/**
 * Two-step delete. No `confirm()` — it is unstyled, it blocks the page, and on mobile it
 * is a system sheet that looks like it came from somewhere else. Arming in place keeps
 * the question next to the thing it is about.
 */
export function DeleteButton({ onDelete, label }: { onDelete: () => void; label: string }) {
  const [armed, setArmed] = useState(false);

  if (!armed) {
    return (
      <button type="button" onClick={() => setArmed(true)} className={buttonTone.danger}>
        DELETE
      </button>
    );
  }

  return (
    <span className="flex items-center gap-1">
      <span className="type-micro text-danger">DELETE {label}?</span>
      <button type="button" onClick={onDelete} className={buttonTone.danger}>
        YES
      </button>
      <button type="button" onClick={() => setArmed(false)} className={buttonTone.plain}>
        NO
      </button>
    </span>
  );
}
