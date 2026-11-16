import type { PowerUpKind, RunResult, SaveData } from '../types';
import { loadSave, SAVE_KEY, TIP_IDS, type SaveStore } from './save';
import { buyUpgrade } from './upgrades';

/** The player's progress between runs: the save, written whenever it changes. */
export class Progress {
  data: SaveData;
  private readonly store: SaveStore;

  constructor(store: SaveStore) {
    this.store = store;
    this.data = loadSave(store);
  }

  /** Writes the save now. */
  save(): void {
    this.store.write(SAVE_KEY, JSON.stringify(this.data));
  }

  /** Banks a finished run: its gold, best score and distance, and the totals. Saves at once. */
  bank(result: RunResult): void {
    const data = this.data;
    data.gold += result.gold;
    data.highScore = Math.max(data.highScore, result.score);
    data.bestDistance = Math.max(data.bestDistance, Math.floor(result.distance));
    data.totals.runs++;
    data.totals.metres += Math.floor(result.distance);
    data.totals.goldEarned += result.gold;
    this.save();
  }

  /** Buys `kind`'s next upgrade level with gold (`buyUpgrade`). Saves and returns true when it was bought. */
  buyUpgrade(kind: PowerUpKind): boolean {
    if (!buyUpgrade(this.data, kind)) return false;
    this.save();
    return true;
  }

  /** Changes one setting and saves. */
  setSetting<K extends keyof SaveData['settings']>(key: K, value: SaveData['settings'][K]): void {
    this.data.settings[key] = value;
    this.save();
  }

  /** Forgets the finished tutorial lessons, so the next run starts with the tutorial again. Saves. */
  replayTutorial(): void {
    this.data.tips = this.data.tips.filter((tip) => !TIP_IDS.includes(tip));
    this.save();
  }
}
