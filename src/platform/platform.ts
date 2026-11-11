/**
 * The platform contract (WP-00). Frozen: later changes are additive only and go through the integrator.
 * One adapter per build: local now, Poki and CrazyGames later (chosen by `vite --mode`, see src/platform/index.ts).
 */

/** A host platform: its SDK lifecycle, ad breaks, and whether the device is a phone or tablet. */
export interface Platform { readonly name: 'local' | 'poki' | 'crazygames'; init(): Promise<void>; loadingStart(): void; loadingStop(): void;
  gameplayStart(): void; gameplayStop(): void; midgameAd(): Promise<void>; rewardedAd(): Promise<boolean>; isMobile(): boolean }
