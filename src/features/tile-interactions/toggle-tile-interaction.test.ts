import { describe, expect, it, vi } from "vitest";

import {
  toggleTileInteraction,
  type TileInteractionRuntime,
  type TileInteractionScene,
  type TileInteractionTileDocument,
  type TileInteractionWallDocument,
} from "./toggle-tile-interaction";

const states = { closed: 0, open: 1, locked: 2 } as const;
const types = { none: 0, door: 1, secret: 2 } as const;

function harness(options: {
  isGM?: boolean;
  config?: unknown;
  walls?: TileInteractionWallDocument[];
  tiles?: Array<{ id: string; hidden: boolean }>;
  fail?: boolean;
} = {}) {
  const walls = options.walls ?? [{ id: "w1", door: types.door, ds: states.closed }];
  const tileSources = options.tiles ?? [{ id: "t1", hidden: true }];
  const wallMap = new Map(walls.map(wall => [wall.id!, wall]));
  const tileMap = new Map<string, TileInteractionTileDocument>();
  const scene = {
    walls: { get: (id: string) => wallMap.get(id) },
    tiles: { get: (id: string) => tileMap.get(id) },
  } as TileInteractionScene;
  const controller = {
    id: "controller",
    hidden: false,
    parent: scene,
    getFlag: vi.fn(() => options.config ?? {
      enabled: true,
      wallIds: ["w1"],
      tileIds: ["t1"],
    }),
  } satisfies TileInteractionTileDocument;
  tileMap.set("controller", controller);
  for (const source of tileSources) {
    tileMap.set(source.id, {
      ...source,
      parent: scene,
      getFlag: vi.fn(),
    });
  }
  const modifyBatch = options.fail
    ? vi.fn().mockRejectedValue(new Error("cancelled"))
    : vi.fn().mockResolvedValue([]);
  const runtime: TileInteractionRuntime = {
    isGM: () => options.isGM ?? true,
    doorTypes: [types.door, types.secret],
    openDoorState: states.open,
    closedDoorState: states.closed,
    modifyBatch,
  };
  return { controller, scene, runtime, modifyBatch, tileMap };
}

describe("toggle Tile interaction", () => {
  it("opens every Door/Secret Door and shows associated Tiles when any Wall is not open", async () => {
    const value = harness({
      walls: [
        { id: "w1", door: types.door, ds: states.open },
        { id: "w2", door: types.secret, ds: states.locked },
      ],
      config: { enabled: true, wallIds: ["w1", "w2"], tileIds: ["t1"] },
    });
    await expect(toggleTileInteraction(value.controller, value.runtime)).resolves.toEqual({
      status: "updated", state: "open", ignoredIds: [],
    });
    expect(value.modifyBatch).toHaveBeenCalledExactlyOnceWith([
      { action: "update", documentName: "Wall", updates: [{ _id: "w2", ds: states.open }], parent: value.scene },
      { action: "update", documentName: "Tile", updates: [{ _id: "t1", hidden: false }], parent: value.scene },
    ]);
  });

  it("closes all open Walls and hides Tiles without writing type or restrictions", async () => {
    const value = harness({
      walls: [
        { id: "w1", door: types.door, ds: states.open },
        { id: "w2", door: types.secret, ds: states.open },
      ],
      tiles: [{ id: "t1", hidden: false }],
      config: { enabled: true, wallIds: ["w1", "w2"], tileIds: ["t1"] },
    });
    await expect(toggleTileInteraction(value.controller, value.runtime)).resolves.toMatchObject({
      status: "updated", state: "closed",
    });
    const operations = value.modifyBatch.mock.calls[0][0];
    expect(operations).toEqual([
      { action: "update", documentName: "Wall", updates: [
        { _id: "w1", ds: states.closed },
        { _id: "w2", ds: states.closed },
      ], parent: value.scene },
      { action: "update", documentName: "Tile", updates: [{ _id: "t1", hidden: true }], parent: value.scene },
    ]);
    expect(JSON.stringify(operations)).not.toMatch(/door|move|sight|light|sound/);
  });

  it("is GM-only and revalidates that the controller belongs to the Scene", async () => {
    const forbidden = harness({ isGM: false });
    await expect(toggleTileInteraction(forbidden.controller, forbidden.runtime)).resolves.toMatchObject({ status: "forbidden" });
    expect(forbidden.modifyBatch).not.toHaveBeenCalled();

    const detached = harness();
    (detached.scene.tiles as { get(id: string): TileInteractionTileDocument | undefined }).get = () => undefined;
    await expect(toggleTileInteraction(detached.controller, detached.runtime)).resolves.toMatchObject({ status: "invalid-config" });
    expect(detached.modifyBatch).not.toHaveBeenCalled();
  });

  it.each([
    [{ enabled: false, wallIds: ["w1"], tileIds: [] }, "disabled"],
    [{ enabled: "yes", wallIds: ["w1"], tileIds: [] }, "invalid-config"],
  ])("does not update for config %j", async (config, status) => {
    const value = harness({ config });
    await expect(toggleTileInteraction(value.controller, value.runtime)).resolves.toMatchObject({ status });
    expect(value.modifyBatch).not.toHaveBeenCalled();
  });

  it("accepts an enabled click without Wall targets as a silent no-op", async () => {
    const value = harness({
      config: { enabled: true, wallIds: [], tileIds: ["t1"] },
    });
    await expect(toggleTileInteraction(value.controller, value.runtime)).resolves.toEqual({
      status: "no-targets", ignoredIds: [],
    });
    expect(value.modifyBatch).not.toHaveBeenCalled();
  });

  it("ignores missing/common Walls and aborts before touching Tiles if none remain", async () => {
    const value = harness({
      walls: [{ id: "ordinary", door: types.none, ds: states.closed }],
      config: { enabled: true, wallIds: ["missing", "ordinary"], tileIds: ["t1"] },
    });
    await expect(toggleTileInteraction(value.controller, value.runtime)).resolves.toEqual({
      status: "no-valid-walls", ignoredIds: ["missing", "ordinary"],
    });
    expect(value.modifyBatch).not.toHaveBeenCalled();
  });

  it("supports no associated Tiles and ignores missing/self Tile references", async () => {
    const value = harness({
      config: { enabled: true, wallIds: ["w1"], tileIds: ["missing", "controller"] },
    });
    await expect(toggleTileInteraction(value.controller, value.runtime)).resolves.toEqual({
      status: "updated", state: "open", ignoredIds: ["missing", "controller"],
    });
    expect(value.modifyBatch).toHaveBeenCalledWith([
      { action: "update", documentName: "Wall", updates: [{ _id: "w1", ds: states.open }], parent: value.scene },
    ]);
  });

  it("reports one atomic batch failure instead of falling back to separate writes", async () => {
    const value = harness({ fail: true });
    await expect(toggleTileInteraction(value.controller, value.runtime)).resolves.toMatchObject({ status: "failed" });
    expect(value.modifyBatch).toHaveBeenCalledOnce();
  });
});
