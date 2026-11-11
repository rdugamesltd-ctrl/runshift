import type { District } from '../types';

/**
 * The district at distance `d` for a seed. WP-00 stub: always the street.
 * TODO WP-31: street → subway → street → rooftop …, each 600-1200 m, changing on shell boundaries.
 */
export function districtAt(_d: number, _seed: number): District {
  return 'street';
}
