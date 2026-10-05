import { describe, expect, it, vi } from "vitest";
import { adjustOwnedEquipmentQuantity } from "./adjust-owned-equipment-quantity";

function setup(quantity: unknown = 2, type = "equipment") {
  const equipment = {
    type, system: { quantity, uses: { value: 3, max: 3 }, useForms: [{ id: "use" }] },
    update: vi.fn(async (data: Record<string, unknown>) => { equipment.system.quantity = data["system.quantity"]; }),
  };
  const actor = { getEmbeddedDocument: vi.fn(() => equipment) } as unknown as foundry.documents.Actor;
  return { equipment, actor };
}

describe("owned Equipment quantity adjustments", () => {
  it("rereads current quantity on each adjustment and updates only its field", async () => {
    const { actor, equipment } = setup();
    expect(await adjustOwnedEquipmentQuantity(actor, "item", -1)).toEqual({ status: "updated", value: 1 });
    expect(await adjustOwnedEquipmentQuantity(actor, "item", -1)).toEqual({ status: "updated", value: 0 });
    expect(equipment.update.mock.calls).toEqual([[{ "system.quantity": 1 }], [{ "system.quantity": 0 }]]);
    expect(equipment.system.uses).toEqual({ value: 3, max: 3 });
    expect(equipment.system.useForms).toEqual([{ id: "use" }]);
  });
  it.each([[0, -1], [Number.MAX_SAFE_INTEGER, 1]] as const)("does not write at boundary %s", async (quantity, adjustment) => {
    const { actor, equipment } = setup(quantity);
    expect(await adjustOwnedEquipmentQuantity(actor, "item", adjustment)).toEqual({ status: "unchanged", value: quantity });
    expect(equipment.update).not.toHaveBeenCalled();
  });
  it.each([null, undefined, -1, 0.5, "2", Infinity])("does not activate absent or invalid quantity %s", async quantity => {
    const { actor, equipment } = setup();
    equipment.system.quantity = quantity;
    expect(await adjustOwnedEquipmentQuantity(actor, "item", 1)).toEqual({ status: "invalid" });
    expect(equipment.update).not.toHaveBeenCalled();
  });
  it("rejects missing Items and other types", async () => {
    const { actor, equipment } = setup(2, "ability");
    expect(await adjustOwnedEquipmentQuantity(actor, "item", 1)).toEqual({ status: "invalid" });
    expect(equipment.update).not.toHaveBeenCalled();
    vi.mocked(actor.getEmbeddedDocument).mockReturnValue(undefined);
    expect(await adjustOwnedEquipmentQuantity(actor, "missing", 1)).toEqual({ status: "invalid" });
  });
});
