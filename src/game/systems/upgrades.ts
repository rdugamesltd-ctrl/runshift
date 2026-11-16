import { UPGRADES } from '../../balance';
import type { PowerUpKind, SaveData } from '../types';

/** The gold the next level of an upgrade costs from `level`, or null at the top level. */
export function upgradeCost(level: number): number | null {
  if (level < 0 || level >= UPGRADES.maxLevel) return null;
  return UPGRADES.cost[level] ?? null;
}

/** Why an upgrade cannot be bought now, or null when it can. */
export type BuyBlock = 'max' | 'gold';

/** Whether `kind`'s next level can be bought with the save's gold: null when it can. */
export function buyBlock(save: Readonly<SaveData>, kind: PowerUpKind): BuyBlock | null {
  const cost = upgradeCost(save.upgrades[kind]);
  if (cost === null) return 'max';
  return save.gold >= cost ? null : 'gold';
}

/**
 * Buys `kind`'s next level: takes its cost from the gold and raises the level. Changes the save in place and
 * returns true, or changes nothing and returns false when the upgrade is at the top or the gold is short.
 */
export function buyUpgrade(save: SaveData, kind: PowerUpKind): boolean {
  if (buyBlock(save, kind) !== null) return false;
  const cost = upgradeCost(save.upgrades[kind]) ?? 0;
  save.gold -= cost;
  save.upgrades[kind]++;
  return true;
}
