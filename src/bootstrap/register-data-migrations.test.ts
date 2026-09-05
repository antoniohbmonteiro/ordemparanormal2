import { afterEach, describe, expect, it, vi } from "vitest";

import {
  registerDataMigrations,
  runPendingDataMigrations,
} from "./register-data-migrations";

afterEach(() => vi.unstubAllGlobals());

function stubGame(version: number, active = true, actors: unknown[] = []) {
  const get = vi.fn(() => version);
  const set = vi.fn(async () => undefined);
  vi.stubGlobal("game", {
    user: { isActiveGM: active },
    actors,
    settings: { get, set },
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

  it("runs 0 -> migration 1 -> persists 1", async () => {
    const settings = stubGame(0);
    await runPendingDataMigrations();
    expect(settings.set).toHaveBeenCalledWith(
      "ordemparanormal2",
      "dataMigrationVersion",
      1,
    );
  });

  it("does nothing for non-active GMs or current/future versions", async () => {
    const inactive = stubGame(0, false);
    await runPendingDataMigrations();
    expect(inactive.get).not.toHaveBeenCalled();

    const current = stubGame(1);
    await runPendingDataMigrations();
    expect(current.set).not.toHaveBeenCalled();

    const future = stubGame(2);
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
});
