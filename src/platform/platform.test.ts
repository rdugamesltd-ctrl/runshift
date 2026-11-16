import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadPlatform } from './index';
import { LocalPlatform } from './local';

afterEach(() => {
  vi.unstubAllGlobals();
});

/** A matchMedia that answers `matches` for the coarse-pointer query and false for anything else. */
function stubPointer(coarse: boolean): void {
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: coarse && query === '(pointer: coarse)', media: query }));
}

describe('LocalPlatform', () => {
  it('has no SDK and no ads: everything resolves at once, a rewarded ad grants nothing', async () => {
    const platform = new LocalPlatform();
    expect(platform.name).toBe('local');
    await expect(platform.init()).resolves.toBeUndefined();
    await expect(platform.midgameAd()).resolves.toBeUndefined();
    await expect(platform.rewardedAd()).resolves.toBe(false);
    platform.loadingStart();
    platform.loadingStop();
    platform.gameplayStart();
    platform.gameplayStop();
  });

  it('is mobile when the main pointer is coarse (a finger), asked each time', () => {
    const platform = new LocalPlatform();
    stubPointer(true);
    expect(platform.isMobile()).toBe(true);
    stubPointer(false);
    expect(platform.isMobile()).toBe(false);
  });

  it('is not mobile where matchMedia is missing', () => {
    vi.stubGlobal('matchMedia', undefined);
    expect(new LocalPlatform().isMobile()).toBe(false);
  });
});

describe('loadPlatform', () => {
  it('gives the local adapter in a local build (__PLATFORM__ is local outside --mode poki/crazygames)', async () => {
    expect(__PLATFORM__).toBe('local');
    const platform = await loadPlatform();
    expect(platform).toBeInstanceOf(LocalPlatform);
    expect(platform.name).toBe('local');
  });
});
