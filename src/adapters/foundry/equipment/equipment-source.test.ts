import { afterEach, expect, it, vi } from "vitest";
import { describeToolApproach, equipmentSourceUuid } from "./equipment-source";
afterEach(() => vi.unstubAllGlobals());

function source(overrides: Record<string, unknown>) {
  return { type: "equipment", uuid: "Item.world", isEmbedded: false, _stats: {}, ...overrides } as unknown as foundry.documents.Item;
}
const pack = "Compendium.ordemparanormal2.tools.Item.source";
it("uses native pack UUIDs and normalizes pack-derived World and embedded Equipment", () => {
  expect(equipmentSourceUuid(source({ uuid: pack, inCompendium: true }))).toBe(pack);
  expect(equipmentSourceUuid(source({ _stats: { compendiumSource: pack } }))).toBe(pack);
  expect(equipmentSourceUuid(source({ isEmbedded: true, uuid: "Actor.a.Item.e",
    _stats: { compendiumSource: pack, duplicateSource: "Item.world" } }))).toBe(pack);
});
it("preserves independent World sources and their native duplicates without matching by name", () => {
  expect(equipmentSourceUuid(source({ name: "Mesmo nome" }))).toBe("Item.world");
  expect(equipmentSourceUuid(source({ uuid: "Item.copy", name: "Mesmo nome" }))).toBe("Item.copy");
  expect(equipmentSourceUuid(source({ isEmbedded: true, uuid: "Actor.a.Item.e", name: "Renomeado",
    _stats: { duplicateSource: "Item.world" } }))).toBe("Item.world");
});
it("does not infer legacy or Actor-to-Actor provenance", () => {
  expect(equipmentSourceUuid(source({ isEmbedded: true, uuid: "Actor.a.Item.e" }))).toBeNull();
  expect(equipmentSourceUuid(source({ isEmbedded: true, uuid: "Actor.a.Item.e",
    _stats: { duplicateSource: "Actor.b.Item.old" } }))).toBeNull();
  expect(equipmentSourceUuid(source({ type: "ability" }))).toBeNull();
});
it("marks incompatible mechanics as invalid while retaining the source/form reference", async () => {
  const form = { id: "analyze", name: "Analisar", description: "", consumesUse: false, mechanic: "laboratory" };
  vi.stubGlobal("fromUuid", vi.fn(async () => ({ type: "equipment", name: "Fonte", system: { category: "tool", useForms: [form] } })));
  const config = { type: "laboratory" as const, sequenceLength: 4 as const };
  expect(await describeToolApproach("Item.source", "analyze", config)).toMatchObject({ valid: true });
  expect(await describeToolApproach("Item.source", "analyze")).toMatchObject({ valid: false, equipmentUuid: "Item.source", useFormId: "analyze" });
  form.mechanic = "standard";
  expect(await describeToolApproach("Item.source", "analyze", config)).toMatchObject({ valid: false });
  expect(await describeToolApproach("Item.source", "removed", config)).toMatchObject({ valid: false, useFormId: "removed" });
});
