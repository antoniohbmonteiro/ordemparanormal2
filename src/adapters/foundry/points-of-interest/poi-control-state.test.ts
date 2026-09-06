import { afterEach, describe, expect, it, vi } from "vitest";
import { isPoiSelectionActive, POI_CONTROL_NAME, SELECT_POI_TOOL } from "./poi-control-state";

function stub(isGM: boolean, control?: string, tool?: string) {
  vi.stubGlobal("game", { user: { isGM } });
  vi.stubGlobal("ui", {
    controls: {
      control: control === undefined ? undefined : { name: control },
      tool: tool === undefined ? undefined : { name: tool },
    },
  });
}

afterEach(() => vi.unstubAllGlobals());

describe("isPoiSelectionActive", () => {
  it("is true only for a GM on the Investigação group with selectPoi active", () => {
    stub(true, POI_CONTROL_NAME, SELECT_POI_TOOL);
    expect(isPoiSelectionActive()).toBe(true);
  });

  it("is false for players, other groups, other tools, or when controls are absent", () => {
    stub(false, POI_CONTROL_NAME, SELECT_POI_TOOL);
    expect(isPoiSelectionActive()).toBe(false);
    stub(true, "tokens", "select");
    expect(isPoiSelectionActive()).toBe(false);
    stub(true, POI_CONTROL_NAME, "createRectangle");
    expect(isPoiSelectionActive()).toBe(false);
    vi.stubGlobal("game", { user: { isGM: true } });
    vi.stubGlobal("ui", {});
    expect(isPoiSelectionActive()).toBe(false);
  });
});
