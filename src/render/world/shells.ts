import type { Chunk, ShellKind } from '../../game/types';

/** Lays out the fixed geometry of one chunk's shell. */
export type ShellBuilder = (chunk: Chunk) => void;

/**
 * Shell builders by kind. WP-00 stub: none.
 * TODO WP-25: street, pit, pitWalls (panels at the wall planes with chevron decals); WP-31: tunnel and roof shells.
 */
export const SHELLS: Partial<Record<ShellKind, ShellBuilder>> = {};
