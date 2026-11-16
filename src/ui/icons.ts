/**
 * Inline SVG icons, drawn on a 24-unit grid with round strokes. `.icon` in styles.css sets the stroke and size,
 * and every icon takes its colour from `color`, so one icon works on a cream sign and on an ink plate alike.
 * The set covers every screen up to M5: run controls, sound and screen tools, directions for the key and swipe
 * hints, the four power-ups, and the chase itself (the hero's speed chevron, the thief's mask, the trophy).
 *
 * Gold is drawn, never typed: always use `coin()`, `coinNode()` or `money()`, because a font glyph looks
 * different on every device.
 */
const PATHS = {
  // Run controls.
  pause:
    '<rect x="6" y="5" width="4.2" height="14" rx="1.3" fill="currentColor" stroke="none"/>' +
    '<rect x="13.8" y="5" width="4.2" height="14" rx="1.3" fill="currentColor" stroke="none"/>',
  play: '<path d="M8.5 5.5v13l10-6.5z" fill="currentColor"/>',
  retry: '<path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3M4.5 4.5v4.5H9"/>',
  home: '<path d="M4 11.5L12 4.5l8 7M6.5 9.5v10h11v-10"/>',
  back: '<path d="M19 12H6M11 6.5L5.5 12l5.5 5.5"/>',
  close: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  plus: '<path d="M12 5.5v13M5.5 12h13"/>',
  lock: '<rect x="5.5" y="10.5" width="13" height="9.5" rx="2"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/>',

  // Sound and screen tools.
  sound:
    '<path d="M4 9.5v5h3.6L12 18.5v-13L7.6 9.5z" fill="currentColor"/>' +
    '<path d="M15.5 9a4.2 4.2 0 0 1 0 6M18.3 6.4a8 8 0 0 1 0 11.2"/>',
  muted: '<path d="M4 9.5v5h3.6L12 18.5v-13L7.6 9.5z" fill="currentColor"/><path d="M16 9.5l5 5M21 9.5l-5 5"/>',
  settings:
    '<path d="M12.6 5.1L13.8 3L17.1 4.3L16.4 6.7L17.3 7.6L19.7 6.9L21 10.2L18.9 11.4L18.9 12.6L21 13.8L19.7 17.1' +
    'L17.3 16.4L16.4 17.3L17.1 19.7L13.8 21L12.6 18.9L11.4 18.9L10.2 21L6.9 19.7L7.6 17.3L6.7 16.4L4.3 17.1L3 13.8' +
    'L5.1 12.6L5.1 11.4L3 10.2L4.3 6.9L6.7 7.6L7.6 6.7L6.9 4.3L10.2 3L11.4 5.1z" stroke-width="2.2"/>' +
    '<circle cx="12" cy="12" r="2.7"/>',
  help:
    '<path d="M8.6 9a3.5 3.5 0 1 1 4.9 3.2c-.9.4-1.5 1.1-1.5 2.1v.4"/>' +
    '<circle cx="12" cy="18.6" r="1.3" fill="currentColor" stroke="none"/>',
  info: '<circle cx="12" cy="12" r="8.6"/><path d="M12 11v5.2"/><circle cx="12" cy="7.7" r="1.3" fill="currentColor" stroke="none"/>',
  expand: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
  shrink: '<path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/>',

  // Directions: swipes, keys and the how-to.
  up: '<path d="M12 19V5.5M6.5 11L12 5.5l5.5 5.5"/>',
  down: '<path d="M12 5v13.5M6.5 13l5.5 5.5 5.5-5.5"/>',
  left: '<path d="M19 12H5.5M11 6.5L5.5 12l5.5 5.5"/>',
  right: '<path d="M5 12h13.5M13 6.5l5.5 5.5-5.5 5.5"/>',
  wallrun: '<path d="M20 3.5v17"/><path d="M4 19.5c5.5-.5 9.5-4.6 11.6-10.8"/><path d="M12.5 9.6l3.4-1.6 1.4 3.5"/>',

  // The four power-ups.
  magnet:
    '<path d="M4.5 9v3.5a7.5 7.5 0 0 0 15 0V9H15v3.5a3 3 0 0 1-6 0V9z" fill="currentColor" stroke="none"/>' +
    '<path d="M4.5 4h4.5v3.4H4.5zM15 4h4.5v3.4H15z" fill="currentColor" stroke="none"/>',
  shield: '<path d="M12 3.4l7 2.8v5.5c0 4.3-2.9 7.7-7 9-4.1-1.3-7-4.7-7-9V6.2z"/><path d="M8.8 10l3.2 3.2 3.2-3.2"/>',
  x2: '<path d="M4.2 9.2l5.6 5.6M9.8 9.2l-5.6 5.6"/><path d="M13.4 9.8a3.1 3.1 0 0 1 6.1.6c0 1.3-.7 2.1-1.8 3L13.3 17h6.5"/>',
  glide:
    '<path d="M3 11.2c0-1.2 1-2.1 2.2-2.1h13.6c1.2 0 2.2.9 2.2 2.1s-1 2.1-2.2 2.1H5.2C4 13.3 3 12.4 3 11.2z" ' +
    'fill="currentColor"/><path d="M7 16.8h3M14 16.8h3M9.5 20h5"/>',

  // The chase: the hero's speed chevron, the thief's mask, gold, records.
  chevron:
    '<path d="M3 5.5h5.2l5.3 6.5-5.3 6.5H3l5.3-6.5z" fill="currentColor" stroke="none"/>' +
    '<path d="M12.2 5.5h3.9l5.3 6.5-5.3 6.5h-3.9l5.3-6.5z" fill="currentColor" stroke="none"/>',
  mask:
    '<path fill="currentColor" stroke="none" fill-rule="evenodd" d="M2.5 10.4C2.5 8 4.5 6.8 7.2 6.8c2 0 3.3.9 4.8.9' +
    's2.8-.9 4.8-.9c2.7 0 4.7 1.2 4.7 3.6 0 3.4-2.1 6.2-4.9 6.2-2.1 0-3-2-4.6-2s-2.5 2-4.6 2c-2.8 0-4.9-2.8-4.9-6.2z' +
    'M5.5 11.1c.6-1.3 2.9-1.7 4.2-.6-.5 1.5-3 1.9-4.2.6zm13 0c-.6-1.3-2.9-1.7-4.2-.6.5 1.5 3 1.9 4.2.6z"/>',
  trophy:
    '<path d="M7.5 4.5h9V9a4.5 4.5 0 0 1-9 0z" fill="currentColor"/>' +
    '<path d="M7.5 6.3H4.6c0 2.6 1.3 4.1 3.4 4.4M16.5 6.3h2.9c0 2.6-1.3 4.1-3.4 4.4M12 14v3.5M8.5 19.5h7"/>',
  flag: '<path d="M6 20.5V4"/><path d="M6 4.5h11l-2.6 3.8L17 12.1H6z" fill="currentColor"/>',
  bolt: '<path d="M13.5 2.5L5 13.5h6.5l-1 8 8.5-11h-6.5z" fill="currentColor"/>',
  star: '<path d="M12 3.2l2.7 5.5 6 .9-4.35 4.25 1 6L12 17l-5.4 2.85 1-6L3.3 9.6l6-.9z" fill="currentColor"/>',
} as const;

/** Every icon's name. */
export type IconName = keyof typeof PATHS;

/** The drawn coin: a gold face with an ink rim, a darker inner ring and a cream shine. Colours come from styles.css. */
const COIN =
  '<circle class="coin-face" cx="12" cy="12" r="10.2"/>' +
  '<circle class="coin-ring" cx="12" cy="12" r="6.3"/>' +
  '<path class="coin-shine" d="M7.4 9.2a5.6 5.6 0 0 1 3.2-3.1"/>';

/** An icon's markup, for templates and innerHTML. The strings are our own constants, never user data. */
export function icon(name: IconName): string {
  return `<svg class="icon icon-${name}" viewBox="0 0 24 24" aria-hidden="true">${PATHS[name]}</svg>`;
}

/** The coin's markup. */
export function coin(): string {
  return `<svg class="coin" viewBox="0 0 24 24" aria-hidden="true">${COIN}</svg>`;
}

/** Parsed once per markup string, then cloned: icons repeat a lot, and cloning is cheaper than parsing. */
const parsed = new Map<string, SVGSVGElement>();

function fromMarkup(markup: string): SVGSVGElement {
  let node = parsed.get(markup);
  if (!node) {
    const holder = document.createElement('div');
    holder.innerHTML = markup;
    node = holder.firstChild as SVGSVGElement;
    parsed.set(markup, node);
  }
  return node.cloneNode(true) as SVGSVGElement;
}

/** An icon as a ready DOM node. */
export function iconNode(name: IconName): SVGSVGElement {
  return fromMarkup(icon(name));
}

/** The coin as a ready DOM node. */
export function coinNode(): SVGSVGElement {
  return fromMarkup(coin());
}

/** A coin followed by an amount, for totals, rewards and prices. `prefix` comes before the coin ("+", "Need "). */
export function money(amount: string, prefix = ''): HTMLSpanElement {
  const node = document.createElement('span');
  node.className = 'money';
  if (prefix) node.append(prefix);
  node.append(coinNode(), amount);
  return node;
}

/** Every icon name, for the icon sheet in tests and tools. */
export const ICON_NAMES = Object.keys(PATHS) as IconName[];
