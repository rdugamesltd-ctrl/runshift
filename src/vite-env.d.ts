/// <reference types="vite/client" />

/** Which build this is, from `vite --mode` (vite.config.ts): the portal builds are poki and crazygames, anything else is local. */
declare const __PLATFORM__: 'local' | 'poki' | 'crazygames';

interface Window {
  /** Set by index.html: puts a start-up error on the boot screen instead of loading forever. */
  bootFailed?: (error: unknown) => void;
  /** Set once the game is up (src/app/boot.ts), so the boot screen's slow-load and error messages stand down. */
  done?: boolean;
}
