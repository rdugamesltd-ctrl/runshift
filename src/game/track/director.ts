import { TIERS, TRAINS } from '../../balance';
import type { District } from '../types';
import { PATTERNS, type Pattern } from './patterns';

/**
 * Chooses from the first street catalogue using the tier's one-action chance and avoiding immediate repeats.
 * WP-02 adds multi-action patterns and beat-accurate minimum gaps; WP-12 adds wall shares.
 */
export class Director {
  private lastId = '';
  private chunksWithoutTrain = 0;

  /** Starts a fresh pattern selection sequence. */
  reset(): void { this.lastId = ''; this.chunksWithoutTrain = 0; }

  /** The next pattern for this tier and district, or null for plain street. */
  pick(tier: number, district: District, rng: () => number): Pattern | null {
    const target = TIERS[Math.min(TIERS.length - 1, Math.max(0, tier))].actionsPer40;
    const choices = PATTERNS.filter(pattern => pattern.tiers.includes(tier) && pattern.districts.includes(district) && pattern.id !== this.lastId);
    const trains = choices.filter(pattern => pattern.id.startsWith('train-'));
    const useTrain = trains.length > 0 && (this.chunksWithoutTrain > 0 || rng() < TRAINS.chunkChance);
    this.chunksWithoutTrain = useTrain ? 0 : this.chunksWithoutTrain + 1;
    if (!useTrain && rng() >= Math.min(1, target)) return null;
    const selected = useTrain ? trains : choices.filter(pattern => !pattern.id.startsWith('train-'));
    if (!selected.length) return null;
    const total = selected.reduce((sum, pattern) => sum + pattern.weight, 0);
    let draw = rng() * total;
    for (const pattern of selected) {
      draw -= pattern.weight;
      if (draw < 0) { this.lastId = pattern.id; return pattern; }
    }
    const chosen = selected[selected.length - 1];
    this.lastId = chosen.id;
    return chosen;
  }
}
