import { lazy, Suspense, useEffect, type ComponentType } from 'react';
import { startSession, useEditing } from '@/lib/edit-mode';

/**
 * Wraps an editor so its code is only downloaded once someone turns edit mode on.
 *
 * Without this, every editor on a page is part of that page's island bundle and ships
 * to everyone. Measured: the four editors and the controls they share came to 27 KB of
 * the site's 149 KB of JavaScript — a fifth of it, for a feature exactly one person can
 * use, on a site whose entire interactive surface before this was a mobile menu.
 *
 * So the island that Astro hydrates is only this shell. It reads one boolean, and for
 * every visitor that boolean is false and nothing further is fetched. The editor itself
 * — the forms, the inputs, the save machinery — is a separate chunk behind a dynamic
 * import, requested when the switch goes on and never before.
 *
 * The other half of the same idea lives in the `.astro` files: each island is rendered
 * only when `PUBLIC_API_URL` is set, so a build with no backend does not carry even
 * this shell. Empty means the code is absent, not that it returns null.
 */
export function lazyEditIsland<P extends object>(
  load: () => Promise<{ default: ComponentType<P> }>,
) {
  const Editor = lazy(load);

  return function EditIsland(props: P) {
    const editing = useEditing();

    // Every island asks; the first one to ask does the work. `/api/me` is resolved once
    // per page load however many editors are on it.
    useEffect(() => {
      startSession();
    }, []);

    if (!editing) return null;

    return (
      <Suspense fallback={<p className="type-meta mt-3">LOADING EDITOR…</p>}>
        <Editor {...props} />
      </Suspense>
    );
  };
}
