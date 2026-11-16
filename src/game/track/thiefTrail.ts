import type { ChunkDecorator } from '../types';

/**
 * Lays the thief's gold trail into each new chunk. WP-00 stub: lays nothing.
 * Every coin the track lays is already the thief's (fromThief: hidden until he passes, then thrown down).
 * TODO WP-34: extra trail coins along the thief's own path (thiefDrop), never inside a
 * box, and bursts of THIEF.burst coins every THIEF.burstEvery.
 */
export const thiefTrail: ChunkDecorator = () => {};
