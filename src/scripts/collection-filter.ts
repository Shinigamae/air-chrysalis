/**
 * Facet filtering for a collection index.
 *
 * Progressive enhancement by design: every card ships in the HTML and is
 * visible without JavaScript. This only ever *hides* cards, so a page with no
 * JS is a complete page showing everything.
 *
 * Not a React island because no state needs to live in a component tree —
 * the DOM already holds it.
 *
 * Markup contract:
 *   [data-filter-group]   wraps the buttons
 *   [data-filter="<key>"] one button per facet; "all" clears the filter
 *   [data-filter-target]  wraps the cards
 *   [data-facet="<key>"]  on each card wrapper
 *   [data-filter-count]   optional live region for the readout
 */
export function initCollectionFilter(root: ParentNode = document): void {
  const group = root.querySelector<HTMLElement>('[data-filter-group]');
  const target = root.querySelector<HTMLElement>('[data-filter-target]');
  const readout = root.querySelector<HTMLElement>('[data-filter-count]');

  if (!group || !target) return;

  const buttons = [...group.querySelectorAll<HTMLButtonElement>('[data-filter]')];
  const cards = [...target.querySelectorAll<HTMLElement>('[data-facet]')];
  if (!buttons.length || !cards.length) return;

  const apply = (key: string) => {
    let shown = 0;
    for (const card of cards) {
      const match = key === 'all' || card.dataset.facet === key;
      card.hidden = !match;
      if (match) shown += 1;
    }

    for (const button of buttons) {
      const isActive = button.dataset.filter === key;
      button.setAttribute('aria-pressed', String(isActive));
      button.classList.toggle('border-signal', isActive);
      button.classList.toggle('text-signal', isActive);
      button.classList.toggle('border-line', !isActive);
      button.classList.toggle('text-ink', !isActive);
    }

    if (readout) {
      readout.textContent = key === 'all' ? '' : `SHOWING ${shown} OF ${cards.length}`;
    }
  };

  for (const button of buttons) {
    button.addEventListener('click', () => apply(button.dataset.filter ?? 'all'));
  }
}
