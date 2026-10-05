import { afterEach, expect, it, vi } from "vitest";
import { registerImportedPoisInScenes } from "./register-imported-pois-in-scenes";

afterEach(() => vi.unstubAllGlobals());

it("registers canonical imported POIs once without changing their visibility", async () => {
  let catalog: string[] = ["Item.manual"];
  const scene = { getFlag: (_scope: string, key: string) => key === "adventureImport"
    ? { adventureId: "adventure", documentId: "actOne.basement" } : catalog,
  update: vi.fn(async (data: Record<string, unknown>) => { catalog = data["flags.ordemparanormal2.pointOfInterestItems"] as string[]; }) };
  const item = { uuid: "Item.poi", type: "pointOfInterest", getFlag: () =>
    ({ adventureId: "adventure", documentId: "actOne.map.01" }) };
  vi.stubGlobal("game", { scenes: { contents: [scene] }, items: { contents: [item] } });
  vi.stubGlobal("foundry", { data: { operators: { ForcedReplacement: { create: (value: unknown) => value } } } });
  const args = ["adventure", [{ id: "actOne.map.01", act: "actOne" }],
    [{ id: "actOne.basement", act: "actOne" }], ["actOne"]] as const;
  expect(await registerImportedPoisInScenes(...args)).toEqual([]);
  expect(catalog).toEqual(["Item.manual", "Item.poi"]);
  expect(await registerImportedPoisInScenes(...args)).toEqual([]);
  expect(scene.update).toHaveBeenCalledOnce();
  expect(item).not.toHaveProperty("update");
});

it("warns and skips registration when canonical Scene identity is ambiguous", async () => {
  const scene = { getFlag: () => ({ adventureId: "adventure", documentId: "actOne.basement" }), update: vi.fn() };
  vi.stubGlobal("game", { scenes: { contents: [scene, scene] }, items: { contents: [] } });
  expect(await registerImportedPoisInScenes("adventure", [], [{ id: "actOne.basement", act: "actOne" }], ["actOne"]))
    .toEqual(["Scene não identificada unicamente para actOne."]);
  expect(scene.update).not.toHaveBeenCalled();
});
