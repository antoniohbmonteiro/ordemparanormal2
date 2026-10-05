import { expect, it } from "vitest";
import { investigationToolInventory } from "./investigation-tool-inventory";
it("lists separate copies in Inventory order with optional counters and availability from their own forms", () => {
  const consuming = { id: "consume", name: "Consumir", description: "", consumesUse: true };
  const free = { ...consuming, id: "free", consumesUse: false };
  const item = (id: string, sort: number, system: Record<string, unknown>) =>
    ({ id, sort, name: "Mesmo nome", type: "equipment", img: "icon.svg", system: { category: "tool", ...system } });
  const items = [item("empty", 4, { uses: { value: 0, max: 3 }, useForms: [consuming] }),
    item("legacy", 1, { quantity: 0, useForms: [] }),
    item("free", 2, { uses: { value: 0, max: 3 }, useForms: [consuming, free] }),
    item("invalid", 3, { useForms: [consuming] }),
    item("other-category", 0, { category: "general", useForms: [] })];
  const actor = { items } as unknown as foundry.documents.Actor;
  expect(investigationToolInventory(actor)).toEqual([
    { id: "legacy", name: "Mesmo nome", img: "icon.svg", uses: null, canUse: true },
    { id: "free", name: "Mesmo nome", img: "icon.svg", uses: { value: 0, max: 3 }, canUse: true },
    { id: "invalid", name: "Mesmo nome", img: "icon.svg", uses: null, canUse: false },
    { id: "empty", name: "Mesmo nome", img: "icon.svg", uses: { value: 0, max: 3 }, canUse: false },
  ]);
});
