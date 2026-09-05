import { beforeEach, describe, expect, it, vi } from "vitest";

const setting = vi.hoisted(() => ({
  createId: vi.fn(),
  get: vi.fn(),
  set: vi.fn(),
}));

vi.mock(
  "../../adapters/foundry/narrative-scenes/narrative-scene-setting",
  () => ({
    createNarrativeSceneId: setting.createId,
    getActiveNarrativeScene: setting.get,
    setActiveNarrativeScene: setting.set,
  }),
);

import {
  endNarrativeScene,
  startNarrativeScene,
} from "./manage-narrative-scene";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("game", { user: { isGM: true } });
  setting.createId.mockReturnValue("scene-1");
  setting.get.mockReturnValue(null);
  setting.set.mockResolvedValue(undefined);
});

describe("startNarrativeScene", () => {
  it("creates and persists a trimmed scene for a GM", async () => {
    await expect(startNarrativeScene("  Laboratório  ")).resolves.toEqual({
      status: "started",
      scene: { id: "scene-1", name: "Laboratório" },
    });
    expect(setting.set).toHaveBeenCalledWith({
      id: "scene-1",
      name: "Laboratório",
    });
  });

  it("does not generate or persist an id for an invalid name", async () => {
    await expect(startNarrativeScene("   ")).resolves.toEqual({
      status: "invalid-name",
    });
    expect(setting.createId).not.toHaveBeenCalled();
    expect(setting.set).not.toHaveBeenCalled();
  });

  it("does not replace an active scene", async () => {
    setting.get.mockReturnValue({ id: "active", name: "Arquivo" });

    await expect(startNarrativeScene("Outra")).resolves.toEqual({
      status: "already-active",
      scene: { id: "active", name: "Arquivo" },
    });
    expect(setting.createId).not.toHaveBeenCalled();
    expect(setting.set).not.toHaveBeenCalled();
  });

  it("generates a new id for every separate lifecycle", async () => {
    setting.createId.mockReturnValueOnce("scene-1").mockReturnValueOnce("scene-2");

    const first = await startNarrativeScene("Primeira");
    setting.get.mockReturnValue({ id: "scene-1", name: "Primeira" });
    await endNarrativeScene("scene-1");
    setting.get.mockReturnValue(null);
    const second = await startNarrativeScene("Segunda");

    expect(first).toMatchObject({ status: "started", scene: { id: "scene-1" } });
    expect(second).toMatchObject({ status: "started", scene: { id: "scene-2" } });
  });

  it("forbids non-GMs before reading state", async () => {
    vi.stubGlobal("game", { user: { isGM: false } });

    await expect(startNarrativeScene("Lab")).resolves.toEqual({
      status: "forbidden",
    });
    expect(setting.get).not.toHaveBeenCalled();
  });

  it("propagates persistence failures without reporting success", async () => {
    setting.set.mockRejectedValue(new Error("write failed"));

    await expect(startNarrativeScene("Lab")).rejects.toThrow("write failed");
  });
});

describe("endNarrativeScene", () => {
  it("clears the matching active scene", async () => {
    setting.get.mockReturnValue({ id: "scene-1", name: "Lab" });

    await expect(endNarrativeScene("scene-1")).resolves.toEqual({
      status: "ended",
      scene: { id: "scene-1", name: "Lab" },
    });
    expect(setting.set).toHaveBeenCalledWith(null);
  });

  it("does not clear a newer scene from a stale action", async () => {
    setting.get.mockReturnValue({ id: "scene-2", name: "Nova" });

    await expect(endNarrativeScene("scene-1")).resolves.toEqual({
      status: "stale",
      scene: { id: "scene-2", name: "Nova" },
    });
    expect(setting.set).not.toHaveBeenCalled();
  });

  it("reports an already inactive lifecycle without writing", async () => {
    await expect(endNarrativeScene("scene-1")).resolves.toEqual({
      status: "inactive",
    });
    expect(setting.set).not.toHaveBeenCalled();
  });

  it("forbids non-GMs before reading state", async () => {
    vi.stubGlobal("game", { user: { isGM: false } });

    await expect(endNarrativeScene("scene-1")).resolves.toEqual({
      status: "forbidden",
    });
    expect(setting.get).not.toHaveBeenCalled();
  });
});
