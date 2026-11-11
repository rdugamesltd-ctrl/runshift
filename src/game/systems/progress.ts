import type { RunResult, SaveData } from '../types';
import { loadSave, SAVE_KEY, type SaveStore } from './save';

/**
 * The player's progress between runs: the save, written whenever it changes.
 * TODO WP-01: anything beyond banking; WP-32: upgrade purchases.
 */
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
}
