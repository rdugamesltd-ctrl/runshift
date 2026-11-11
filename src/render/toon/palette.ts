import { TOON } from '../../balance';

/** The six UI colours, also used in the world. No purple. */
export const PALETTE = {
  ink: TOON.ink,
  cream: '#fff4dd',
  teal: '#17b3a3',
  orange: '#ff7a1f',
  gold: '#ffbf2a',
  red: '#e8402e',
} as const;

// TODO WP-23: the world palette (street, rooftop, subway) the kit bake maps vertex colours to.
