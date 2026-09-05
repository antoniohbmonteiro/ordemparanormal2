import { afterEach, describe, expect, it, vi } from "vitest";
import { addPoiSceneControls } from "../adapters/foundry/points-of-interest/poi-scene-controls";
import { registerPoiSceneControls } from "./register-poi-scene-controls";

afterEach(() => vi.unstubAllGlobals());

describe("POI Scene Controls bootstrap", () => {
  it("registers one preparation listener when called during init", () => {
    const on = vi.fn();
    vi.stubGlobal("Hooks", { on });

    registerPoiSceneControls();

    expect(on).toHaveBeenCalledExactlyOnceWith(
      "getSceneControlButtons",
      addPoiSceneControls,
    );
  });
});
