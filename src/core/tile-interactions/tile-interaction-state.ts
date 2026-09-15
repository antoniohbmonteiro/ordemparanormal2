export type TileInteractionState = "open" | "closed";

/**
 * Walls are the sole source of truth for a Tile interaction. An empty set is
 * invalid because there would be no authoritative state to toggle.
 */
export function decideTileInteractionState(
  wallOpenStates: readonly boolean[],
): TileInteractionState | null {
  if (wallOpenStates.length === 0) return null;
  return wallOpenStates.every(Boolean) ? "closed" : "open";
}
