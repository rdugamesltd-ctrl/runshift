import { CREDITS } from './credits.generated';

/** Fills the credits panel with every attribution. WP-00 stub: a plain list. TODO WP-52: the real panel. */
export function mountCredits(panel: HTMLElement): void {
  const list = document.createElement('ul');
  for (const row of CREDITS) {
    const item = document.createElement('li');
    item.textContent = `${row.asset}: ${row.attribution}`;
    list.appendChild(item);
  }
  panel.replaceChildren(list);
}
