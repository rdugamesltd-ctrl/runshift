import type { PerfMark } from '../debug/hooks';

/** Records a performance mark for the load-time tool. */
export function mark(name: PerfMark): void {
  performance.mark(name);
}

/** Fades the boot screen out once the first frame is drawn, and tells index.html the game is up. */
export function bootDone(): void {
  window.done = true;
  const boot = document.getElementById('boot');
  if (!boot) return;
  boot.classList.add('done');
  setTimeout(() => boot.remove(), 600);
}

/** Puts a start-up error on the boot screen (index.html) instead of leaving it loading forever. */
export function bootFailed(error: unknown): void {
  console.error(error);
  window.bootFailed?.(error);
}
