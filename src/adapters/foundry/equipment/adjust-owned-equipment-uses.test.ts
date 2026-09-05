import { describe, expect, it, vi } from "vitest";

import { adjustOwnedEquipmentUses } from "./adjust-owned-equipment-uses";

function createActor(uses: unknown, type = "equipment") {
  const update = vi.fn().mockResolvedValue(undefined);
  const equipment = { type, system: { uses }, update };
  const actor = {
    getEmbeddedDocument: vi.fn().mockReturnValue(equipment),
  } as unknown as foundry.documents.Actor;

  return { actor, update };
}

describe("adjust owned Equipment uses", () => {
  it("updates only the embedded Equipment uses value", async () => {
    const { actor, update } = createActor({ value: 2, max: 3 });

    await expect(adjustOwnedEquipmentUses(actor, "equipment-1", -1)).resolves
      .toEqual({ status: "updated", value: 1 });
    expect(update).toHaveBeenCalledOnce();
    expect(update).toHaveBeenCalledWith({ "system.uses.value": 1 });
  });

  it("does not update when the requested boundary is already reached", async () => {
    const { actor, update } = createActor({ value: 3, max: 3 });

    await expect(adjustOwnedEquipmentUses(actor, "equipment-1", 1)).resolves
      .toEqual({ status: "unchanged", value: 3 });
    expect(update).not.toHaveBeenCalled();
  });

  it.each([
    [null, "equipment"],
    [{ value: 1, max: 3 }, "ability"],
  ])("rejects an invalid target (%j, %s)", async (uses, type) => {
    const { actor, update } = createActor(uses, type);

    await expect(adjustOwnedEquipmentUses(actor, "equipment-1", 1)).resolves
      .toEqual({ status: "invalid" });
    expect(update).not.toHaveBeenCalled();
  });
});
