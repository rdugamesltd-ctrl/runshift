import type { Platform } from './platform';

/**
 * No portal: no SDK, no ads. init and the ad breaks resolve at once; a rewarded ad grants nothing, because none
 * was shown. The lifecycle calls (loading, gameplay) have nobody to tell.
 */
export class LocalPlatform implements Platform {
  readonly name = 'local';

  /** Nothing to load. */
  async init(): Promise<void> {}

  loadingStart(): void {}

  loadingStop(): void {}

  gameplayStart(): void {}

  gameplayStop(): void {}

  /** No ad: the game goes straight on. */
  async midgameAd(): Promise<void> {}

  /** No ad was shown, so no reward. */
  async rewardedAd(): Promise<boolean> {
    return false;
  }

  /** A coarse main pointer (a finger) means a phone or tablet. Asked each time: a 2-in-1 can change. */
  isMobile(): boolean {
    return typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  }
}
