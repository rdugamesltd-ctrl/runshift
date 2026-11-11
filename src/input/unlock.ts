import type { InputPort } from './types';

/**
 * Browsers start audio only from a user gesture. Listens (capture phase) for pointerup, touchend and keydown:
 * calls onFirstGesture once, then onGesture on every gesture (iOS needs a resume after each interruption).
 * Returns a function that removes the listeners.
 */
export function installUnlock(port: Pick<InputPort, 'onFirstGesture' | 'onGesture'>): () => void {
  let first = true;
  const handler = () => {
    if (first) {
      first = false;
      port.onFirstGesture();
    }
    port.onGesture();
  };
  const types = ['pointerup', 'touchend', 'keydown'] as const;
  for (const type of types) window.addEventListener(type, handler, { capture: true });
  return () => {
    for (const type of types) window.removeEventListener(type, handler, { capture: true });
  };
}
