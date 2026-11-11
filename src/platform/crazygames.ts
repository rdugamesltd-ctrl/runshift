import type { Platform } from './platform';

/**
 * CrazyGames. WP-00 stub: behaves like the local build.
 * TODO WP-53: CrazyGames SDK v3 init, game.gameplayStart/Stop, loading events, ad.requestAd('midgame' |
 * 'rewarded'), mute and pause around ads.
 */
export class CrazyGamesPlatform implements Platform {
  readonly name = 'crazygames';

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
