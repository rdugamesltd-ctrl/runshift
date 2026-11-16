import { describe, expect, it } from 'vitest';
import { UPGRADES } from '../../balance';
import { memoryStore } from './save';
import { Progress } from './progress';
import { buyBlock, buyUpgrade, upgradeCost } from './upgrades';

describe('upgrades', () => {
  it('prices each level from UPGRADES.cost and has no price at the top', () => {
    expect(upgradeCost(0)).toBe(UPGRADES.cost[0]);
    expect(upgradeCost(UPGRADES.maxLevel - 1)).toBe(UPGRADES.cost[UPGRADES.maxLevel - 1]);
    expect(upgradeCost(UPGRADES.maxLevel)).toBeNull();
  });

  it('buys a level with gold, and refuses when gold is short or the level is full', () => {
    const progress = new Progress(memoryStore());
    const save = progress.data;
    save.gold = UPGRADES.cost[0] - 1;
    expect(buyBlock(save, 'magnet')).toBe('gold');
    expect(buyUpgrade(save, 'magnet')).toBe(false);
    expect(save.upgrades.magnet).toBe(0);

    save.gold = UPGRADES.cost[0] + 5;
    expect(buyUpgrade(save, 'magnet')).toBe(true);
    expect(save.upgrades.magnet).toBe(1);
    expect(save.gold).toBe(5);

    save.upgrades.shield = UPGRADES.maxLevel;
    save.gold = 1e9;
    expect(buyBlock(save, 'shield')).toBe('max');
    expect(buyUpgrade(save, 'shield')).toBe(false);
    expect(save.gold).toBe(1e9);
  });

  it('saves a purchase through Progress', () => {
    const store = memoryStore();
    const progress = new Progress(store);
    progress.data.gold = UPGRADES.cost[0];
    expect(progress.buyUpgrade('glide')).toBe(true);
    const reloaded = new Progress(store);
    expect(reloaded.data.upgrades.glide).toBe(1);
    expect(reloaded.data.gold).toBe(0);
  });
});
