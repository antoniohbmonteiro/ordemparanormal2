import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildPoiRegionRevealUpdate,
  isPoiRevealedTo,
  parsePoiRegionReveal,
  POI_REGION_REVEAL_FLAG_PATH,
  readPoiRegionReveal,
  selectNewlyRevealedUserIds,
  type PoiRegionReveal,
} from "./poi-region-reveal";

afterEach(() => vi.unstubAllGlobals());

describe("POI Region reveal state", () => {
  it.each([undefined, null, [], "hidden", 3, true, {}, { mode: "bogus" }, { mode: 1 }])(
    "treats an unusable value %j as fully hidden",
    value => expect(parsePoiRegionReveal(value)).toEqual({ mode: "hidden", users: [], notified: [] }),
  );

  it("keeps users only in users mode and dedupes/filters both id lists", () => {
    expect(parsePoiRegionReveal({
      mode: "users",
      users: ["a", "a", " ", "", 5, "b"],
      notified: ["x", "x", "y", 2, null],
    })).toEqual({ mode: "users", users: ["a", "b"], notified: ["x", "y"] });

    expect(parsePoiRegionReveal({ mode: "everyone", users: ["a"], notified: "nope" }))
      .toEqual({ mode: "everyone", users: [], notified: [] });
  });

  it("reads the flag at the dedicated namespace/key", () => {
    const getFlag = vi.fn(() => ({ mode: "everyone", users: [], notified: ["u1"] }));
    expect(readPoiRegionReveal({ getFlag })).toEqual({ mode: "everyone", users: [], notified: ["u1"] });
    expect(getFlag).toHaveBeenCalledExactlyOnceWith("ordemparanormal2", "pointOfInterestReveal");
  });

  describe("isPoiRevealedTo", () => {
    const users: PoiRegionReveal = { mode: "users", users: ["u1"], notified: [] };
    it("always authorizes the GM regardless of mode", () => {
      expect(isPoiRevealedTo({ mode: "hidden", users: [], notified: [] }, "gm", true)).toBe(true);
    });
    it("authorizes every player when everyone", () => {
      expect(isPoiRevealedTo({ mode: "everyone", users: [], notified: [] }, "u9", false)).toBe(true);
    });
    it("authorizes only listed players when users", () => {
      expect(isPoiRevealedTo(users, "u1", false)).toBe(true);
      expect(isPoiRevealedTo(users, "u2", false)).toBe(false);
    });
    it("authorizes no player when hidden", () => {
      expect(isPoiRevealedTo({ mode: "hidden", users: [], notified: [] }, "u1", false)).toBe(false);
    });
  });

  describe("selectNewlyRevealedUserIds", () => {
    it("returns authorized ids that were never notified", () => {
      const reveal: PoiRegionReveal = { mode: "users", users: [], notified: ["a"] };
      expect(selectNewlyRevealedUserIds(reveal, ["a", "b", "c", "b"])).toEqual(["b", "c"]);
    });
    it("returns nothing when everyone authorized was already notified", () => {
      const reveal: PoiRegionReveal = { mode: "everyone", users: [], notified: ["a", "b"] };
      expect(selectNewlyRevealedUserIds(reveal, ["a", "b"])).toEqual([]);
    });
  });

  it("builds the update with a single replacement operator at the reveal key", () => {
    const create = vi.fn((value: unknown) => ({ replacement: value }));
    vi.stubGlobal("foundry", { data: { operators: { ForcedReplacement: { create } } } });
    const update = buildPoiRegionRevealUpdate({ mode: "users", users: ["u1"], notified: ["u1"] });
    expect(update).toEqual({
      [POI_REGION_REVEAL_FLAG_PATH]: { replacement: { mode: "users", users: ["u1"], notified: ["u1"] } },
    });
    expect(create).toHaveBeenCalledExactlyOnceWith({ mode: "users", users: ["u1"], notified: ["u1"] });
    expect(POI_REGION_REVEAL_FLAG_PATH).toBe("flags.ordemparanormal2.pointOfInterestReveal");
  });
});
