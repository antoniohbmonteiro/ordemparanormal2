/**
 * Generate a stable identity for a new Point of Interest information entry.
 *
 * Isolated behind this adapter so the pure editor/list code and the ItemSheet
 * stay testable without the Foundry global. Mirrors `createNarrativeSceneId`.
 */
export function createPointOfInterestInformationId(): string {
  return foundry.utils.randomID();
}
