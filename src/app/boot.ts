import type { PerfMark } from '../debug/hooks';

/** Records a performance mark for the load-time tool. */
export function mark(name: PerfMark): void {
  performance.mark(name);
}

/**
 * Tells index.html the game is up (once the first frame is drawn) and fades the boot screen out. With
 * `tapToStart` the boot screen first asks for a tap, click or key: browsers allow sound only after a gesture, so
 * that gesture (heard by installUnlock, which listens first) starts the menu music before the menu shows. The
 * gesture is swallowed, so it never reaches the menu (Enter would press Play).
 */
export function bootDone(tapToStart = false): void {
  window.done = true;
  const boot = document.getElementById('boot');
  if (!boot) return;
  if (!tapToStart) {
    fadeOut(boot);
    return;
  }
  const prompt = boot.querySelector('span');
  if (prompt) prompt.textContent = matchMedia('(pointer: coarse)').matches ? 'TAP TO START' : 'CLICK TO START';
  boot.classList.add('tap');
  const options: AddEventListenerOptions = { capture: true };
  const start = (event: Event): void => {
    event.stopImmediatePropagation();
    // Browsers do not count Escape as a gesture, so it would not start the sound.
    if (event.type === 'keydown' && (event as KeyboardEvent).key === 'Escape') return;
    window.removeEventListener('click', start, options);
    window.removeEventListener('keydown', start, options);
    fadeOut(boot);
  };
  // A click, not pointerup: it comes after the press is over, so nothing under the fading screen sees it.
  window.addEventListener('click', start, options);
  window.addEventListener('keydown', start, options);
}

function fadeOut(boot: HTMLElement): void {
  boot.classList.add('done');
  setTimeout(() => boot.remove(), 600);
}

/** Puts a start-up error on the boot screen (index.html) instead of leaving it loading forever. */
export function bootFailed(error: unknown): void {
  console.error(error);
  window.bootFailed?.(error);
}
