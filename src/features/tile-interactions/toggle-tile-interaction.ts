import { readTileInteractionConfig } from "../../adapters/foundry/tile-interactions/tile-interaction-config";
import { decideTileInteractionState, type TileInteractionState } from "../../core/tile-interactions/tile-interaction-state";

interface EmbeddedCollection<T> {
  get(id: string): T | null | undefined;
}

export interface TileInteractionWallDocument {
  readonly id: string | null;
  readonly door: number;
  readonly ds: number;
}

export interface TileInteractionTileDocument {
  readonly id: string | null;
  readonly hidden: boolean;
  readonly parent: TileInteractionScene | null;
  getFlag(scope: string, key: string): unknown;
}

export interface TileInteractionScene {
  readonly walls: EmbeddedCollection<TileInteractionWallDocument>;
  readonly tiles: EmbeddedCollection<TileInteractionTileDocument>;
}

interface BatchUpdateOperation {
  readonly action: "update";
  readonly documentName: "Wall" | "Tile";
  readonly updates: readonly Record<string, unknown>[];
  readonly parent: TileInteractionScene;
}

export interface TileInteractionRuntime {
  isGM(): boolean;
  readonly doorTypes: readonly number[];
  readonly openDoorState: number;
  readonly closedDoorState: number;
  modifyBatch(operations: readonly BatchUpdateOperation[]): Promise<unknown>;
}

export type ToggleTileInteractionResult =
  | { readonly status: "updated"; readonly state: TileInteractionState; readonly ignoredIds: readonly string[] }
  | { readonly status: "forbidden"; readonly ignoredIds: readonly string[] }
  | { readonly status: "disabled"; readonly ignoredIds: readonly string[] }
  | { readonly status: "invalid-config"; readonly ignoredIds: readonly string[] }
  | { readonly status: "no-targets"; readonly ignoredIds: readonly string[] }
  | { readonly status: "no-valid-walls"; readonly ignoredIds: readonly string[] }
  | { readonly status: "failed"; readonly ignoredIds: readonly string[]; readonly error: unknown };

function foundryRuntime(): TileInteractionRuntime {
  return {
    isGM: () => !!game.user?.isGM,
    doorTypes: [CONST.WALL_DOOR_TYPES.DOOR, CONST.WALL_DOOR_TYPES.SECRET],
    openDoorState: CONST.WALL_DOOR_STATES.OPEN,
    closedDoorState: CONST.WALL_DOOR_STATES.CLOSED,
    modifyBatch: operations =>
      (foundry.documents as unknown as FoundryDocumentsWithModifyBatch)
        .modifyBatch(operations),
  };
}

export async function toggleTileInteraction(
  controller: TileInteractionTileDocument,
  runtime: TileInteractionRuntime = foundryRuntime(),
): Promise<ToggleTileInteractionResult> {
  const ignoredIds: string[] = [];
  if (!runtime.isGM()) return { status: "forbidden", ignoredIds };

  const scene = controller.parent;
  if (!scene || !controller.id || scene.tiles.get(controller.id) !== controller) {
    return { status: "invalid-config", ignoredIds };
  }

  const config = readTileInteractionConfig(controller);
  if (!config) return { status: "invalid-config", ignoredIds };
  if (!config.enabled) return { status: "disabled", ignoredIds };
  if (config.wallIds.length === 0) return { status: "no-targets", ignoredIds };

  const walls: TileInteractionWallDocument[] = [];
  for (const id of config.wallIds) {
    const wall = scene.walls.get(id);
    if (!wall || !wall.id || !runtime.doorTypes.includes(wall.door)) {
      ignoredIds.push(id);
      continue;
    }
    walls.push(wall);
  }
  if (walls.length === 0) return { status: "no-valid-walls", ignoredIds };

  const state = decideTileInteractionState(
    walls.map(wall => wall.ds === runtime.openDoorState),
  );
  if (!state) return { status: "no-valid-walls", ignoredIds };

  const tiles: TileInteractionTileDocument[] = [];
  for (const id of config.tileIds) {
    const tile = scene.tiles.get(id);
    if (!tile || !tile.id || tile === controller) {
      ignoredIds.push(id);
      continue;
    }
    tiles.push(tile);
  }

  const targetDoorState = state === "open"
    ? runtime.openDoorState
    : runtime.closedDoorState;
  const wallUpdates = walls
    .filter(wall => wall.ds !== targetDoorState)
    .map(wall => ({ _id: wall.id!, ds: targetDoorState }));
  const targetHidden = state !== "open";
  const tileUpdates = tiles
    .filter(tile => tile.hidden !== targetHidden)
    .map(tile => ({ _id: tile.id!, hidden: targetHidden }));

  const operations: BatchUpdateOperation[] = [{
    action: "update",
    documentName: "Wall",
    updates: wallUpdates,
    parent: scene,
  }];
  if (tileUpdates.length > 0) {
    operations.push({
      action: "update",
      documentName: "Tile",
      updates: tileUpdates,
      parent: scene,
    });
  }

  try {
    await runtime.modifyBatch(operations);
    return { status: "updated", state, ignoredIds };
  } catch (error) {
    return { status: "failed", ignoredIds, error };
  }
}
