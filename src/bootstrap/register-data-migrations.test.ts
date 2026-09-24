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

  it("runs pending migrations and persists version 3", async () => {
    const settings = stubGame(0);
    await runPendingDataMigrations();
    expect(settings.set).toHaveBeenCalledWith(
      "ordemparanormal2",
      "dataMigrationVersion",
      3,
    );
  });

  it("does nothing for non-active GMs or current/future versions", async () => {
    const inactive = stubGame(0, false);
    await runPendingDataMigrations();
    expect(inactive.get).not.toHaveBeenCalled();

    const current = stubGame(3);
    await runPendingDataMigrations();
    expect(current.set).not.toHaveBeenCalled();

    const future = stubGame(4);
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

  it("migrates legacy Aptitude without notifying the GM", async () => {
    const source = { system: { publicDescription: "", gmContext: "", information: [],
      skills: [{ skill: "aptitude", information: [{ id: "clue", content: "", difficulty: 6,
        showDifficultyToPlayers: false }] }] } };
    const poi = {
      uuid: "Item.aptitude", type: "pointOfInterest",
      toObject: () => structuredClone(source),
      getFlag: () => undefined,
      update: vi.fn(async (changes: { system: { value: typeof source.system } }) => {
        source.system = structuredClone(changes.system.value);
      }),
    };
    const settings = stubGame(2, true, [], [poi]);
    const error = vi.fn();
    const once = vi.fn();
    vi.stubGlobal("ui", { notifications: { error } });
    vi.stubGlobal("Hooks", { once });
    vi.stubGlobal("foundry", { data: { operators: { ForcedReplacement: {
      create: (value: unknown) => ({ value }),
    } } } });
    registerDataMigrations();
    await once.mock.calls[0][1]();
    await vi.waitFor(() => expect(settings.set).toHaveBeenCalledWith(
      "ordemparanormal2", "dataMigrationVersion", 3,
    ));
    expect(poi.update).toHaveBeenCalledTimes(1);
    expect(source.system).not.toHaveProperty("skills");
    expect(error).not.toHaveBeenCalled();
  });

  it("reports every unsafe POI and leaves the world at version 2", async () => {
    const invalid = (uuid: string) => ({ uuid, type: "pointOfInterest", toObject: () => ({ system: {
      publicDescription: "", gmContext: "", information: [],
      skills: [{ skill: "research", information: [] }],
    } }) });
    const settings = stubGame(2, true, [], [invalid("Item.first"), invalid("Item.second")]);
    const error = vi.fn();
    const once = vi.fn();
    vi.stubGlobal("ui", { notifications: { error } });
    vi.stubGlobal("Hooks", { once });
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    registerDataMigrations();
    await once.mock.calls[0][1]();
    await vi.waitFor(() => expect(error).toHaveBeenCalled());
    expect(settings.set).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledWith(expect.stringMatching(/Item\.first.*Item\.second/u), { permanent: true });
  });
});
