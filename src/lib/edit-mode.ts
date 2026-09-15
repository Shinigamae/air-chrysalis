import { useSyncExternalStore } from 'react';
import {
  completeLoginFromUrl,
  getMe,
  hasBackend,
  signOut as clearToken,
  type Me,
} from '@/lib/api';

/**
 * Edit mode's state, shared by every island on the page.
 *
 * It lives outside React on purpose. Astro hydrates each island as its own root, so two
 * islands never share a context provider — the admin bar in the shell and the rating
 * control on a game page are separate React trees that happen to be on the same page.
 * A plain store with `useSyncExternalStore` in front of it is what they can both see,
 * and it costs less than any of the ways of pretending they are one tree.
 *
 * The site is also a multi-page app: every link is a full document load, so this state
 * is rebuilt from scratch on every navigation. That is why `editing` is persisted —
 * without it, turning edit mode on and clicking through to the thing you meant to edit
 * would turn it off again.
 */

const EDITING_KEY = 'shinigamae.editing';

export interface EditState {
  /** False until `/api/me` has answered. Controls render nothing before this. */
  ready: boolean;
  me: Me | null;
  /** The switch. Only ever true for an admin. */
  editing: boolean;
  /** Set when the last identity check failed outright, for the admin bar to show. */
  error: string | null;
}

let state: EditState = {
  ready: !hasBackend, // With no backend there is nothing to wait for; the answer is "no".
  me: null,
  editing: false,
  error: null,
};

const listeners = new Set<() => void>();

function emit(next: Partial<EditState>): void {
  state = { ...state, ...next };
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * The snapshot must be referentially stable between emits or `useSyncExternalStore`
 * re-renders forever — it compares with `Object.is`, and a fresh object every call
 * never equals the last one.
 */
const snapshot = (): EditState => state;

/*
 * Server rendering: Astro renders every island to HTML at build time, where there is no
 * `localStorage` and no session. The server snapshot is therefore always the signed-out
 * one, which is also what the baked page should say — the markup a visitor is served
 * must not depend on whether the author happened to be signed in when it was built.
 */
const serverState: EditState = { ready: false, me: null, editing: false, error: null };
const serverSnapshot = (): EditState => serverState;

export function useEditState(): EditState {
  return useSyncExternalStore(subscribe, snapshot, serverSnapshot);
}

/** True only when an admin has the switch on. The one check a control should make. */
export function useEditing(): boolean {
  const { editing, me } = useEditState();
  return editing && me?.isAdmin === true;
}

/* --- lifecycle ------------------------------------------------------------ */

let started = false;

/**
 * Resolves who is signed in, once per page load, however many islands ask.
 *
 * Idempotent because it has to be: the admin bar and every editable region call it from
 * their own effect, and they mount in no particular order.
 */
export function startSession(): void {
  if (started || !hasBackend) return;
  started = true;

  // A redirect back from Discord is resolved before anything else, because on that
  // one page load the token does not exist yet and getMe() would answer null.
  completeLoginFromUrl()
    .then((signedIn) => signedIn ?? getMe())
    .then((me) => {
      emit({
        ready: true,
        me,
        error: null,
        // Restore the switch, but never for someone who cannot use it — a stale flag in
        // storage must not survive signing out, or signing in as somebody else.
        editing: me?.isAdmin === true && readEditing(),
      });
    })
    .catch((error: unknown) => {
      // Unreachable API. Not signed in, and say why rather than looking broken.
      emit({
        ready: true,
        me: null,
        editing: false,
        error: error instanceof Error ? error.message : 'Could not reach the API.',
      });
    });
}

export function setEditing(editing: boolean): void {
  if (editing && state.me?.isAdmin !== true) return;
  writeEditing(editing);
  emit({ editing });
}

export function setMe(me: Me | null): void {
  emit({ me, ready: true, error: null, editing: me?.isAdmin === true && state.editing });
}

export function signOut(): void {
  clearToken();
  writeEditing(false);
  emit({ me: null, editing: false, error: null });
}

/* --- persistence ---------------------------------------------------------- */

/*
 * sessionStorage rather than localStorage: edit mode should end when the tab does.
 * Leaving it on across days means opening the site to read it and finding it covered in
 * controls, and the cost of turning it back on is one click.
 */

function readEditing(): boolean {
  try {
    return sessionStorage.getItem(EDITING_KEY) === '1';
  } catch {
    return false;
  }
}

function writeEditing(editing: boolean): void {
  try {
    if (editing) sessionStorage.setItem(EDITING_KEY, '1');
    else sessionStorage.removeItem(EDITING_KEY);
  } catch {
    /* Private mode. Edit mode then lasts one page, which still works. */
  }
}

/* --- save state ----------------------------------------------------------- */

export type SaveState =
  | { status: 'idle' }
  | { status: 'saving' }
  | { status: 'saved' }
  | { status: 'error'; message: string };

/**
 * The shape every control's save button drives. Kept here rather than in each control
 * so the strings a person reads are written once.
 */
export function describeSave(save: SaveState): string {
  switch (save.status) {
    case 'saving':
      return 'SAVING…';
    case 'saved':
      return 'SAVED';
    case 'error':
      return save.message;
    default:
      return '';
  }
}
