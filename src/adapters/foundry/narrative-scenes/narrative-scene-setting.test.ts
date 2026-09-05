import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  ACTIVE_NARRATIVE_SCENE_SETTING_KEY,
  SYSTEM_ID,
} from "../../../config/system-config";
import {
  createNarrativeSceneId,
  deserializeNarrativeScene,
  getActiveNarrativeScene,
  NO_ACTIVE_NARRATIVE_SCENE,
  registerActiveNarrativeSceneSetting,
  serializeNarrativeScene,
  setActiveNarrativeScene,
} from "./narrative-scene-setting";

const get = vi.fn();
const register = vi.fn();
const set = vi.fn(async () => undefined);
const randomID = vi.fn(() => "generated-scene-id");

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("game", { settings: { get, register, set } });
  vi.stubGlobal("foundry", { utils: { randomID } });
});

describe("Narrative Scene setting serialization", () => {
  it("uses an empty string for no active scene", () => {
    expect(serializeNarrativeScene(null)).toBe(NO_ACTIVE_NARRATIVE_SCENE);
    expect(deserializeNarrativeScene(NO_ACTIVE_NARRATIVE_SCENE)).toBeNull();
  });

  it("round-trips a valid scene and normalizes its name", () => {
    const serialized = serializeNarrativeScene({ id: "scene-1", name: "  Lab  " });

    expect(deserializeNarrativeScene(serialized)).toEqual({
      id: "scene-1",
      name: "Lab",
    });
  });

  it.each([
    "{",
    "null",
    "[]",
    '{"id":"","name":"Lab"}',
    '{"id":"scene-1","name":""}',
  ])("rejects malformed or invalid persisted data", (value) => {
    expect(() => deserializeNarrativeScene(value)).toThrow(TypeError);
  });

  it("rejects non-string persisted values", () => {
    expect(() => deserializeNarrativeScene({})).toThrow(TypeError);
  });
});

describe("Narrative Scene Foundry boundary", () => {
  it("registers one hidden world-scoped string setting", () => {
    const onChange = vi.fn();

    registerActiveNarrativeSceneSetting(onChange);

    expect(register).toHaveBeenCalledWith(
      SYSTEM_ID,
      ACTIVE_NARRATIVE_SCENE_SETTING_KEY,
      expect.objectContaining({
        scope: "world",
        config: false,
        type: String,
        default: "",
        onChange,
      }),
    );
  });

  it("reads and writes only through the registered setting", async () => {
    get.mockReturnValue('{"id":"scene-1","name":"Lab"}');

    expect(getActiveNarrativeScene()).toEqual({ id: "scene-1", name: "Lab" });
    await setActiveNarrativeScene(null);

    expect(get).toHaveBeenCalledWith(
      SYSTEM_ID,
      ACTIVE_NARRATIVE_SCENE_SETTING_KEY,
    );
    expect(set).toHaveBeenCalledWith(
      SYSTEM_ID,
      ACTIVE_NARRATIVE_SCENE_SETTING_KEY,
      "",
    );
  });

  it("delegates new identities to Foundry randomID", () => {
    expect(createNarrativeSceneId()).toBe("generated-scene-id");
    expect(randomID).toHaveBeenCalledOnce();
  });
});
