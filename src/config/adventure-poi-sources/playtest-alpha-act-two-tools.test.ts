import { readFile, readdir } from "node:fs/promises";
import { expect, it } from "vitest";
import { ACT_TWO_TOOL_BINDINGS, ACT_TWO_TOOL_SOURCES } from "./playtest-alpha-act-two-tools";
import { PLAYTEST_ALPHA_POI_SOURCES, PLAYTEST_ALPHA_POI_REVISION } from "./playtest-alpha";

it("pins canonical UUIDs, form IDs and mechanics to the current system-owned Equipment sources", async () => {
  const manifest = JSON.parse(await readFile(new URL("../../../system.json", import.meta.url), "utf8"));
  expect(manifest.id).toBe("ordemparanormal2");
  expect(manifest.packs.find((pack: { name: string }) => pack.name === "equipment"))
    .toMatchObject({ path: "packs/equipment", type: "Item", system: "ordemparanormal2" });
  const directory = new URL("../../../packs-src/equipment/", import.meta.url);
  const sources = await Promise.all((await readdir(directory)).filter(name => name.endsWith(".json"))
    .map(async name => JSON.parse(await readFile(new URL(name, directory), "utf8"))));
  for (const source of Object.values(ACT_TWO_TOOL_SOURCES)) {
    const id = source.equipmentUuid.split(".").at(-1);
    const matches = sources.filter(item => item._id === id);
    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({ type: "equipment", system: { category: "tool" } });
    const form = matches[0].system.useForms.find((form: { id: string }) => form.id === source.useFormId);
    expect(form).toBeDefined();
    expect(form.mechanic ?? "standard").toBe(source.mechanic);
    if (source.mechanic !== "standard") expect(form.consumesUse).toBe(false);
    if (source.useFormId === "ultraviolet-burst" || source.useFormId === "reveal") expect(form.consumesUse).toBe(true);
  }
});
it("uses explicit stable IDs, complete branch parameters and only current Act II source identities", () => {
  expect(PLAYTEST_ALPHA_POI_REVISION).toBe(6);
  for (const binding of ACT_TWO_TOOL_BINDINGS) {
    expect(PLAYTEST_ALPHA_POI_SOURCES.find(source => source.id === binding.poiId)?.act).toBe("actTwo");
    expect(binding.information.length).toBeGreaterThan(0);
    expect(binding.information.every(entry => entry.id.startsWith(`${binding.poiId}.tool.${binding.tool}`))).toBe(true);
    expect(binding.sequenceLength !== undefined).toBe(binding.tool === "laboratory");
    expect(binding.radio !== undefined).toBe(binding.tool === "radio");
  }
  expect(new Set(ACT_TWO_TOOL_BINDINGS.map(binding => `${binding.poiId}:${binding.tool}`)).size).toBe(32);
});
