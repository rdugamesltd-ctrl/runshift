import type { InputPort } from './types';

/**
 * Events that count as a user gesture for starting audio: pointerup and touchend for touch (iOS wants the lift),
 * keydown for keys. A mouse press already counts at pointerdown, which comes before its pointerup.
 */
const GESTURES = ['pointerup', 'touchend', 'keydown'] as const;

/**
 * Browsers start audio only from a user gesture. Listens in the capture phase (so nothing can stop it) for
 * pointerup, touchend and keydown: calls `onFirstGesture` once, on the first, then `onGesture` on every gesture,
 * the first included, because iOS needs a resume after every interruption (a call, Siri, another app's sound).
 * Escape is skipped: browsers do not count it as a gesture. The callbacks are read at call time, so they can be
 * set after installing. `target` is the window by default. Returns a function that removes the listeners.
 */
export function installUnlock(
  port: Pick<InputPort, 'onFirstGesture' | 'onGesture'>,
  target: EventTarget = window,
): () => void {
  let first = true;
  const handler = (event: Event): void => {
    if (event.type === 'keydown' && (event as KeyboardEvent).key === 'Escape') return;
    if (first) {
      first = false;
      port.onFirstGesture();
    }
    port.onGesture();
  };
  const options: AddEventListenerOptions = { capture: true, passive: true };
  for (const type of GESTURES) target.addEventListener(type, handler, options);
  return () => {
    for (const type of GESTURES) target.removeEventListener(type, handler, options);
  };
}
