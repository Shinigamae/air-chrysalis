/**
 * The ground the site is standing on, and the switch that changes it.
 *
 * Two themes, named on `<html data-theme>`, and one stylesheet each side of
 * that attribute: `tokens.css` is the dark one and `theme-light.css` restates
 * it for paper. Nothing else in the codebase reads the theme — components ask
 * for `bg-panel` and `text-ink` and get whichever palette is mounted.
 *
 * Dark is the default and stays the default on a first visit, including for a
 * reader whose system asks for light. That is a deliberate refusal of
 * `prefers-color-scheme`: the near-black canvas is the design rather than a
 * preference served, and the switch in the header is how someone says
 * otherwise. Once they have said it, the choice is theirs and it persists.
 *
 * Not a React island. The state is a single attribute the DOM already holds,
 * and it has to be settled before the first paint — which is earlier than any
 * bundle runs. See the inline script in `AppShell.astro`, which is the same
 * three lines written out again for that reason and is the only duplicate of
 * `applyTheme` in the codebase.
 */

export type Theme = 'dark' | 'light';

/** Where the reader's choice is kept. Namespaced — this is a shared origin. */
export const THEME_KEY = 'shinigamae:theme';

/**
 * The browser chrome around the page: the address bar on Android, the title
 * bar of an installed PWA. It is a `<meta>` rather than a token because it is
 * consumed outside the document, so it cannot be a `var()` and has to be kept
 * in step by hand. These are `--color-canvas` in each theme.
 */
const CHROME: Record<Theme, string> = {
  dark: '#09090B',
  light: '#F4F4F5',
};

/** Mount a theme. Everything visual follows from the attribute. */
export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;

  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (meta) meta.content = CHROME[theme];
}

/** Whatever is currently mounted — the attribute, not the stored choice. */
export function currentTheme(): Theme {
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
}

/**
 * Wire up every switch on the page — there are two, the desktop header's and
 * the mobile header's, and only one of them is ever visible at a time. They
 * are kept in step anyway: the breakpoint is a media query, so a window
 * dragged across `md` swaps which one is on screen without a navigation.
 *
 * Markup contract:
 *   [data-theme-toggle]   the button; its `aria-pressed` tracks "light is on"
 *   .theme-mark--to-light the mark shown while the dark theme is mounted
 *   .theme-mark--to-dark  the mark shown while the light one is
 *
 * The two marks are swapped by CSS off `<html data-theme>` (theme-light.css),
 * so this never touches them.
 */
export function initThemeToggle(root: ParentNode = document): void {
  const buttons = [...root.querySelectorAll<HTMLButtonElement>('[data-theme-toggle]')];
  if (!buttons.length) return;

  const sync = (theme: Theme) => {
    for (const button of buttons) {
      button.setAttribute('aria-pressed', String(theme === 'light'));
      button.title = theme === 'light' ? 'Switch to the dark theme' : 'Switch to the light theme';
    }
  };

  for (const button of buttons) {
    button.addEventListener('click', () => {
      const next: Theme = currentTheme() === 'light' ? 'dark' : 'light';
      applyTheme(next);
      sync(next);

      // Private browsing and a blocked-storage profile both throw here, and
      // neither is a reason for the click not to have worked — the theme is
      // already mounted above. It just will not outlive the tab.
      try {
        localStorage.setItem(THEME_KEY, next);
      } catch {
        /* the choice holds for this page either way */
      }
    });
  }

  // The buttons ship with the dark theme's labels, because that is what the
  // HTML is baked with. If the inline script mounted the light one before
  // paint, this is where the labels catch up.
  sync(currentTheme());

  /*
   * The same site open in another tab. `storage` fires only in the tabs that
   * did *not* make the change, which is exactly the set that needs telling.
   */
  window.addEventListener('storage', (event) => {
    if (event.key !== THEME_KEY) return;
    const theme: Theme = event.newValue === 'light' ? 'light' : 'dark';
    applyTheme(theme);
    sync(theme);
  });
}
