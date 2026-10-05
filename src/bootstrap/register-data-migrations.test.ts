import { afterEach, describe, expect, it, vi } from "vitest";

import {
  registerDataMigrations,
  runPendingDataMigrations,
} from "./register-data-migrations";

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

function stubGame(version: number, active = true, actors: unknown[] = [], items: unknown[] = []) {
  const get = vi.fn(() => version);
  const set = vi.fn(async () => undefined);
  vi.stubGlobal("game", {
    user: { isActiveGM: active },
    actors,
    items,
    scenes: [],
    settings: { get, set, register: vi.fn() },
  });
  return { get, set };
}

describe("data migration runner", () => {
  it("registers a hidden world setting with default zero", () => {
    const register = vi.fn();
    vi.stubGlobal("game", { settings: { register } });
    vi.stubGlobal("Hooks", { once: vi.fn() });
    registerDataMigrations();
    expect(register).toHaveBeenCalledWith(
      "ordemparanormal2",
      "dataMigrationVersion",
      expect.objectContaining({
        scope: "world",
        config: false,
        type: Number,
        default: 0,
      }),
    );
  });

  it("runs pending migrations and persists version 2", async () => {
    const settings = stubGame(0);
    await runPendingDataMigrations();
    expect(settings.set).toHaveBeenCalledWith(
      "ordemparanormal2",
      "dataMigrationVersion",
      2,
    );
  });

  it("does nothing for non-active GMs or current/future versions", async () => {
    const inactive = stubGame(0, false);
    await runPendingDataMigrations();
    expect(inactive.get).not.toHaveBeenCalled();

    const current = stubGame(2);
    await runPendingDataMigrations();
    expect(current.set).not.toHaveBeenCalled();

    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const future = stubGame(3);
    await runPendingDataMigrations();
    expect(future.set).not.toHaveBeenCalled();
  });

  it("does not advance the setting when migration 1 fails", async () => {
    const actor = {
      id: "agent",
      type: "agent",
      system: { occupation: "Pesquisador" },
      getEmbeddedCollection: () => [],
      createEmbeddedDocuments: vi.fn().mockRejectedValue(new Error("failed")),
    };
    const settings = stubGame(0, true, [actor]);
    await expect(runPendingDataMigrations()).rejects.toThrow("failed");
    expect(settings.set).not.toHaveBeenCalled();
  });

  it("does not advance the setting when migration 2 fails", async () => {
    const ability = {
      type: "ability",
      toObject: () => ({ system: { cost: { source: "none", amount: 0 } } }),
      update: vi.fn().mockRejectedValue(new Error("ability migration failed")),
    };
    const settings = stubGame(1, true, [], [ability]);
    await expect(runPendingDataMigrations()).rejects.toThrow("ability migration failed");
    expect(settings.set).not.toHaveBeenCalled();
  });

  it("does not inspect or migrate POIs at startup", async () => {
    const poi = {
      uuid: "Item.poi", type: "pointOfInterest",
      toObject: vi.fn(() => { throw new Error("POI read during startup"); }),
      update: vi.fn(),
    };
    const settings = stubGame(1, true, [], [poi]);
    const error = vi.fn();
    const once = vi.fn();
    vi.stubGlobal("ui", { notifications: { error } });
    vi.stubGlobal("Hooks", { once });
    registerDataMigrations();
    await once.mock.calls[0][1]();
    await vi.waitFor(() => expect(settings.set).toHaveBeenCalledWith(
      "ordemparanormal2", "dataMigrationVersion", 2,
    ));
    expect(poi.toObject).not.toHaveBeenCalled();
    expect(poi.update).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });
});
