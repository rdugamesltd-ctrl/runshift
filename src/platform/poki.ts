import type { Platform } from './platform';

/**
 * Poki. WP-00 stub: behaves like the local build.
 * TODO WP-53: load the Poki SDK, PokiSDK.init, gameplayStart/Stop, commercialBreak, rewardedBreak, mute and
 * pause around ads.
 */
export class PokiPlatform implements Platform {
  readonly name = 'poki';

  async init(): Promise<void> {}
  loadingStart(): void {}
  loadingStop(): void {}
  gameplayStart(): void {}
  gameplayStop(): void {}
  async midgameAd(): Promise<void> {}

  async rewardedAd(): Promise<boolean> {
    return false;
  }

  isMobile(): boolean {
    return matchMedia('(pointer: coarse)').matches;
  }
}
