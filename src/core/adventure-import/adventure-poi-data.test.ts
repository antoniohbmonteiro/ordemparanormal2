import { expect, it } from "vitest";
import { syntheticToolPresets } from "../../qa/playtest-alpha-tools-fixture";
import { validateAdventurePoiData } from "./adventure-poi-data";
import { isToolApproach } from "../../documents/item/point-of-interest-data";

it("accepts old, tool-only and mixed presets with current Laboratory/Radio branches", () => {
  const presets = syntheticToolPresets();
  presets.forEach(validateAdventurePoiData);
  const altar = presets.find(preset => preset.id === "actTwo.map.08")!;
  validateAdventurePoiData({ ...altar, information: altar.information.filter(entry => entry.id.includes(".tool.")) });
  validateAdventurePoiData({ ...altar, information: [{ ...altar.information[2], approaches: [
    altar.information[0].approaches[0], altar.information[2].approaches[0],
  ] }] });
});
it("rejects extra fields, artificial skill fields, mixed config branches and conflicts for the same pair", () => {
  const altar = syntheticToolPresets().find(preset => preset.id === "actTwo.map.08")!;
  const entry = altar.information.find(entry => entry.id.endsWith(".tool.radio"))!;
  const tool = entry.approaches[0];
  if (!isToolApproach(tool) || tool.mechanicConfig?.type !== "radio") throw new Error("Missing Radio");
  for (const invalid of [
    { ...tool, difficulty: 6 }, { ...tool, quantity: 1 },
    { ...tool, mechanicConfig: { ...tool.mechanicConfig, sequenceLength: 4 } },
    { ...tool, mechanicConfig: { type: "laboratory", sequenceLength: 4, extra: true } },
    { ...tool, mechanicConfig: { ...tool.mechanicConfig, privateExtra: true } },
  ]) expect(() => validateAdventurePoiData({ ...altar, information: [{ ...entry, approaches: [invalid] }] })).toThrow();
  expect(() => validateAdventurePoiData({ ...altar, information: [entry, { ...entry, id: "other", approaches: [
    { ...tool, mechanicConfig: { ...tool.mechanicConfig, falseFragments: [] } },
  ] }] })).toThrow();
  const skill = altar.information[0];
  expect(() => validateAdventurePoiData({ ...altar, information: [{ ...skill, approaches: [
    { ...skill.approaches[0], mechanicConfig: tool.mechanicConfig },
  ] }] })).toThrow();
});
