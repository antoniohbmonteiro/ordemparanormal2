import { describe, expect, it } from "vitest";

import {
  createNarrativeScene,
  isNarrativeScene,
} from "./narrative-scene";

describe("Narrative Scene domain", () => {
  it("creates a scene and trims only the name boundaries", () => {
    expect(createNarrativeScene("scene-1", "  Laboratório  Abandonado  ")).toEqual({
      id: "scene-1",
      name: "Laboratório  Abandonado",
    });
  });

  it.each([
    ["", "Scene"],
    ["   ", "Scene"],
    ["scene-1", ""],
    ["scene-1", "   "],
  ])("rejects empty identifiers and names", (id, name) => {
    expect(() => createNarrativeScene(id, name)).toThrow(TypeError);
  });

  it("recognizes only objects with non-empty string identity and name", () => {
    expect(isNarrativeScene({ id: "scene-1", name: "Laboratório" })).toBe(true);
    expect(isNarrativeScene({ id: "", name: "Laboratório" })).toBe(false);
    expect(isNarrativeScene({ id: "scene-1", name: 42 })).toBe(false);
    expect(isNarrativeScene(null)).toBe(false);
  });
});
