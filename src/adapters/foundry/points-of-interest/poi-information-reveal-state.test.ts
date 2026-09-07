import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildPoiInformationRevealUpdate,
  parsePoiInformationRevealState,
  POI_INFORMATION_REVEAL_FLAG_PATH,
  readPoiInformationRevealState,
} from "./poi-information-reveal-state";

afterEach(() => vi.unstubAllGlobals());

describe("POI information reveal state", () => {
  it.each([undefined, null, [], "bad", {}, { itemUuid: "" }, {
    itemUuid: "Item.poi", informationIds: "bad",
  }])("rejects malformed state %j", value => {
    expect(parsePoiInformationRevealState(value)).toBeNull();
  });

  it("deduplicates valid opaque ids and ignores invalid entries", () => {
    expect(parsePoiInformationRevealState({
      itemUuid: "Item.poi",
      informationIds: ["a", "a", "", " ", 2, "b"],
    })).toEqual({ itemUuid: "Item.poi", informationIds: ["a", "b"] });
  });

  it("treats state from another association as empty", () => {
    const getFlag = vi.fn(() => ({ itemUuid: "Item.old", informationIds: ["same-id"] }));
    expect(readPoiInformationRevealState({ getFlag }, "Item.new")).toEqual({
      itemUuid: "Item.new", informationIds: [],
    });
    expect(getFlag).toHaveBeenCalledExactlyOnceWith(
      "ordemparanormal2", "pointOfInterestInformationReveal",
    );
  });

  it("builds a replacement containing only association and ids", () => {
    const create = vi.fn((value: unknown) => ({ replacement: value }));
    vi.stubGlobal("foundry", { data: { operators: { ForcedReplacement: { create } } } });
    expect(buildPoiInformationRevealUpdate({
      itemUuid: "Item.poi", informationIds: ["a"],
    })).toEqual({
      [POI_INFORMATION_REVEAL_FLAG_PATH]: {
        replacement: { itemUuid: "Item.poi", informationIds: ["a"] },
      },
    });
    expect(JSON.stringify(create.mock.calls)).not.toContain("content");
  });
});
