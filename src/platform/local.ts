import type { Platform } from './platform';

/** No portal: no SDK, no ads. A rewarded ad grants nothing because none was shown. */
export class LocalPlatform implements Platform {
  readonly name = 'local';

  async init(): Promise<void> {}
  loadingStart(): void {}
  loadingStop(): void {}
  gameplayStart(): void {}
  gameplayStop(): void {}
  async midgameAd(): Promise<void> {}

  async rewardedAd(): Promise<boolean> {
    return false;
  }

  /** A coarse pointer (a finger) means a phone or tablet. */
  isMobile(): boolean {
    return typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  }
}
