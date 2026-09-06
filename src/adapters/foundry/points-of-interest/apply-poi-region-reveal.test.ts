import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applyPoiRegionReveal } from "./apply-poi-region-reveal";
import { POI_REGION_REVEAL_FLAG_PATH } from "./poi-region-reveal";

class ForcedReplacement {
  private constructor(readonly value: unknown) {}
  static create(value: unknown): ForcedReplacement {
    return new ForcedReplacement(value);
  }
}

function region(flag?: unknown) {
  return {
    getFlag: vi.fn((_scope: string, key: string) =>
      key === "pointOfInterestReveal" ? flag : undefined),
    update: vi.fn().mockResolvedValue(undefined),
  };
}

function deps(players: readonly string[], publishNotice = vi.fn().mockResolvedValue(undefined)) {
  return { listPlayerUserIds: () => players, publishNotice };
}

function replacement(update: unknown): unknown {
  return (update as Record<string, ForcedReplacement>)[POI_REGION_REVEAL_FLAG_PATH].value;
}

beforeEach(() => {
  vi.stubGlobal("foundry", { data: { operators: { ForcedReplacement } } });
});
afterEach(() => vi.unstubAllGlobals());

describe("applyPoiRegionReveal", () => {
  it("hidden -> everyone: persists and notifies every player once", async () => {
    const doc = region();
    const publishNotice = vi.fn().mockResolvedValue(undefined);
    await applyPoiRegionReveal(doc, { mode: "everyone", users: [] }, deps(["p1", "p2"], publishNotice));

    expect(doc.update).toHaveBeenCalledOnce();
    expect(replacement(doc.update.mock.calls[0][0])).toEqual({
      mode: "everyone", users: [], notified: ["p1", "p2"],
    });
    expect(publishNotice).toHaveBeenCalledExactlyOnceWith(["p1", "p2"]);
  });

  it("re-applying everyone when all are notified writes nothing and does not notify", async () => {
    const doc = region({ mode: "everyone", users: [], notified: ["p1", "p2"] });
    const publishNotice = vi.fn().mockResolvedValue(undefined);
    await applyPoiRegionReveal(doc, { mode: "everyone", users: [] }, deps(["p1", "p2"], publishNotice));

    expect(doc.update).not.toHaveBeenCalled();
    expect(publishNotice).not.toHaveBeenCalled();
  });

  it("everyone -> hidden: persists, sends no message", async () => {
    const doc = region({ mode: "everyone", users: [], notified: ["p1"] });
    const publishNotice = vi.fn().mockResolvedValue(undefined);
    await applyPoiRegionReveal(doc, { mode: "hidden", users: [] }, deps(["p1"], publishNotice));

    expect(replacement(doc.update.mock.calls[0][0])).toEqual({
      mode: "hidden", users: [], notified: ["p1"],
    });
    expect(publishNotice).not.toHaveBeenCalled();
  });

  it("users mode drops non-player ids (including the GM) from the input", async () => {
    const doc = region();
    const publishNotice = vi.fn().mockResolvedValue(undefined);
    await applyPoiRegionReveal(
      doc,
      { mode: "users", users: ["p1", "gm", "ghost"] },
      deps(["p1", "p2"], publishNotice),
    );

    expect(replacement(doc.update.mock.calls[0][0])).toEqual({
      mode: "users", users: ["p1"], notified: ["p1"],
    });
    expect(publishNotice).toHaveBeenCalledExactlyOnceWith(["p1"]);
  });

  it("adding a second user later notifies only the new id", async () => {
    const doc = region({ mode: "users", users: ["p1"], notified: ["p1"] });
    const publishNotice = vi.fn().mockResolvedValue(undefined);
    await applyPoiRegionReveal(
      doc,
      { mode: "users", users: ["p1", "p2"] },
      deps(["p1", "p2"], publishNotice),
    );

    expect(replacement(doc.update.mock.calls[0][0])).toEqual({
      mode: "users", users: ["p1", "p2"], notified: ["p1", "p2"],
    });
    expect(publishNotice).toHaveBeenCalledExactlyOnceWith(["p2"]);
  });

  it("propagates a persistence failure and never attempts the whisper", async () => {
    const doc = region();
    doc.update.mockRejectedValue(new Error("boom"));
    const publishNotice = vi.fn().mockResolvedValue(undefined);

    await expect(
      applyPoiRegionReveal(doc, { mode: "everyone", users: [] }, deps(["p1"], publishNotice)),
    ).rejects.toThrow("boom");
    expect(publishNotice).not.toHaveBeenCalled();
  });

  it("swallows a whisper failure: reveal + notified stay persisted, no retry", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const doc = region();
    const publishNotice = vi.fn().mockRejectedValue(new Error("chat down"));

    await expect(
      applyPoiRegionReveal(doc, { mode: "everyone", users: [] }, deps(["p1"], publishNotice)),
    ).resolves.toBeUndefined();

    expect(doc.update).toHaveBeenCalledOnce();
    expect(replacement(doc.update.mock.calls[0][0])).toEqual({
      mode: "everyone", users: [], notified: ["p1"],
    });
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });
});
