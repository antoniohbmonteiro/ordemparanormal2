import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";

const commonPath = process.env.FOUNDRY_V14_COMMON_PATH;
afterEach(() => vi.unstubAllGlobals());
describe.skipIf(!commonPath)("native Foundry v14 Equipment provenance (no persistence)", () => {
  it("stamps only an ephemeral World clone and preserves existing compendium provenance", async () => {
    const native = await import(/* @vite-ignore */ pathToFileURL(commonPath!).href);
    vi.stubGlobal("CONFIG", { Item: { documentClass: native.documents.BaseItem, dataModels: {} } });
    vi.stubGlobal("game", { packs: { get: () => undefined }, model: { Item: { equipment: {} } }, release: { version: "14.367" },
      system: { id: "ordemparanormal2", version: "test" } });
    for (const compendiumSource of [null, "Compendium.test.tools.Item.abcdefghijklmnop"]) {
      const source = new native.documents.BaseItem({ _id: "abcdefghijklmnop", name: "Ferramenta", type: "equipment",
        _stats: { compendiumSource } });
      const before = source.toObject();
      const clone = source.clone({}, { keepId: true, addSource: true });
      expect(clone.toObject()._stats).toMatchObject({ compendiumSource, duplicateSource: source.uuid });
      expect(source.toObject()).toEqual(before);
      clone.updateSource({ name: "Renomeada" });
      expect(clone.toObject()._stats.duplicateSource).toBe(source.uuid);
    }
  });
});
