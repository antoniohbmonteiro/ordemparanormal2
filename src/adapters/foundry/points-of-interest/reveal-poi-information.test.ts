import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { revealPoiInformation } from "./reveal-poi-information";

const fromUuid = vi.fn();
const update = vi.fn();
const flags: Record<string, unknown> = {
  pointOfInterest: { itemUuid: "Item.poi" },
};
const region = {
  getFlag: vi.fn((_scope: string, key: string) => flags[key]),
  update,
};

const information = (id: string) => ({
  id, difficulty: 6, content: `Content ${id}`, showDifficultyToPlayers: false,
});
const input = {
  sceneId: "scene", regionId: "region", expectedItemUuid: "Item.poi", informationId: "b",
};

function stubGame(isGM = true, resolvedRegion: unknown = region): void {
  vi.stubGlobal("game", {
    user: { isGM },
    scenes: { get: () => resolvedRegion ? { regions: { get: () => resolvedRegion } } : undefined },
  });
}

beforeEach(() => {
  delete flags.pointOfInterestInformationReveal;
  region.getFlag.mockClear();
  update.mockReset().mockResolvedValue(undefined);
  fromUuid.mockReset().mockResolvedValue({
    uuid: "Item.poi", type: "pointOfInterest", system: {
      skills: [{ skill: "perception", information: [information("a"), information("b")] }],
    },
  });
  vi.stubGlobal("fromUuid", fromUuid);
  vi.stubGlobal("foundry", {
    data: { operators: { ForcedReplacement: { create: (value: unknown) => value } } },
  });
});
afterEach(() => vi.unstubAllGlobals());

describe("revealPoiInformation", () => {
  it("rejects a player before resolving or mutating anything", async () => {
    stubGame(false);
    expect(await revealPoiInformation(input)).toEqual({ ok: false, reason: "forbidden" });
    expect(fromUuid).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it("rejects a missing placement, changed association, wrong Item and unknown id", async () => {
    stubGame(true, null);
    expect(await revealPoiInformation(input)).toEqual({ ok: false, reason: "unavailable" });

    stubGame();
    flags.pointOfInterest = { itemUuid: "Item.other" };
    expect(await revealPoiInformation(input)).toEqual({ ok: false, reason: "stale" });
    flags.pointOfInterest = { itemUuid: "Item.poi" };

    fromUuid.mockResolvedValueOnce({ uuid: "Item.poi", type: "weapon" });
    expect(await revealPoiInformation(input)).toEqual({ ok: false, reason: "unavailable" });
    expect(await revealPoiInformation({ ...input, informationId: "missing" }))
      .toEqual({ ok: false, reason: "stale" });
    expect(update).not.toHaveBeenCalled();
  });

  it("appends the id, prunes obsolete ids, and never writes Item content", async () => {
    stubGame();
    flags.pointOfInterestInformationReveal = {
      itemUuid: "Item.poi", informationIds: ["a", "obsolete"],
    };
    expect(await revealPoiInformation(input)).toEqual({ ok: true, changed: true });
    expect(update).toHaveBeenCalledExactlyOnceWith({
      "flags.ordemparanormal2.pointOfInterestInformationReveal": {
        itemUuid: "Item.poi", informationIds: ["a", "b"],
      },
    });
    expect(JSON.stringify(update.mock.calls)).not.toContain("Content");
  });

  it("is idempotent when the information is already revealed", async () => {
    stubGame();
    flags.pointOfInterestInformationReveal = {
      itemUuid: "Item.poi", informationIds: ["b"],
    };
    expect(await revealPoiInformation(input)).toEqual({ ok: true, changed: false });
    expect(update).not.toHaveBeenCalled();
  });

  it("prunes obsolete ids even when the requested information was already revealed", async () => {
    stubGame();
    flags.pointOfInterestInformationReveal = {
      itemUuid: "Item.poi", informationIds: ["obsolete", "b"],
    };
    expect(await revealPoiInformation(input)).toEqual({ ok: true, changed: true });
    expect(update).toHaveBeenCalledExactlyOnceWith({
      "flags.ordemparanormal2.pointOfInterestInformationReveal": {
        itemUuid: "Item.poi", informationIds: ["b"],
      },
    });
  });

  it("revalidates association after resolving the Item", async () => {
    stubGame();
    fromUuid.mockImplementationOnce(async () => {
      flags.pointOfInterest = { itemUuid: "Item.other" };
      return {
        uuid: "Item.poi", type: "pointOfInterest", system: {
          skills: [{ skill: "perception", information: [information("b")] }],
        },
      };
    });
    expect(await revealPoiInformation(input)).toEqual({ ok: false, reason: "stale" });
    expect(update).not.toHaveBeenCalled();
  });
});
