import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { ACT_TWO_TOOL_BINDINGS, ACT_TWO_TOOL_SOURCES } from "../../config/adventure-poi-sources/playtest-alpha-act-two-tools";
import { PLAYTEST_ALPHA_POI_SOURCES } from "../../config/adventure-poi-sources/playtest-alpha";
import { isToolApproach } from "../../documents/item/point-of-interest-data";
import { syntheticToolPresets, syntheticToolSection } from "../../qa/playtest-alpha-tools-fixture";
import { parsePlaytestAlphaPoiSection, parsePlaytestAlphaPois } from "./parse-playtest-alpha-pois";
import { validateAdventurePoiData } from "../../core/adventure-import/adventure-poi-data";
import { toolInformationIds, radioInformationIds } from "../../core/investigation/resolve-information";

describe("v1.1 Act II tool population", () => {
  it("populates exactly 32 pairs, 34 Informations, 29 always and 5 situational across 12 POIs", () => {
    const presets = syntheticToolPresets();
    const information = presets.flatMap(preset => preset.information.filter(entry => entry.id.includes(".tool.")));
    expect(ACT_TWO_TOOL_BINDINGS).toHaveLength(32);
    expect(information).toHaveLength(34);
    expect(information.filter(entry => entry.availability.mode === "always")).toHaveLength(29);
    expect(information.filter(entry => entry.availability.mode === "situational")).toHaveLength(5);
    expect(presets.filter(preset => preset.information.length > 2)).toHaveLength(12);
    expect(information.map(entry => entry.id)).toEqual(ACT_TWO_TOOL_BINDINGS.flatMap(binding => binding.information.map(entry => entry.id)));
    expect(new Set(information.map(entry => entry.id)).size).toBe(34);
    expect(JSON.stringify(information)).not.toMatch(/equipment0000005|illuminate/);
    presets.forEach(validateAdventurePoiData);
  });
  it("preserves old IDs/content/availability and appends in source table order without sharing config objects", () => {
    const fixture = syntheticToolSection("actTwo.map.06", true);
    const legacy = parsePlaytestAlphaPoiSection(fixture.source, fixture.page);
    const enriched = parsePlaytestAlphaPoiSection(fixture.source, fixture.page, "playtest-alpha-v1.1");
    expect(enriched.information.slice(0, 2)).toEqual(legacy.information);
    expect(enriched.information.slice(2).map(entry => entry.id)).toEqual([
      "actTwo.map.06.tool.thermometer", "actTwo.map.06.tool.infrared", "actTwo.map.06.tool.laboratory", "actTwo.map.06.tool.laboratory.edgarBlood",
    ]);
    const [first, second] = enriched.information.slice(-2).map(entry => entry.approaches[0]);
    expect(first.mechanicConfig).toEqual(second.mechanicConfig);
    expect(first.mechanicConfig).not.toBe(second.mechanicConfig);
    expect(enriched.information.at(-1)?.availability).toMatchObject({ mode: "situational", condition: expect.stringContaining("três jogadores") });
    expect(enriched.gmContext).not.toContain("Leitura sintética");
    expect(enriched.gmContext).toContain("Referências de mídia para uso manual: PDI_TESTE_01");
    expect(enriched.gmContext).toContain("HANDOUT 04, ÁUDIO EMF 1");
  });
  it("keeps Act I and v1.0 unchanged and rejects missing or ambiguous bindings only for v1.1 Act II", () => {
    const fixture = syntheticToolSection("actTwo.map.03");
    const withoutTools = { ...fixture.page, items: fixture.page.items.filter(item => item.y > 598) };
    expect(() => parsePlaytestAlphaPoiSection(fixture.source, withoutTools, "playtest-alpha-v1.1")).toThrow(/ausente ou ambígua/);
    expect(parsePlaytestAlphaPoiSection(fixture.source, withoutTools, "playtest-alpha-v1.0").information).toHaveLength(2);
    const actOne = { ...fixture.source, id: "actOne.synthetic", act: "actOne" as const };
    expect(parsePlaytestAlphaPoiSection(actOne, fixture.page, "playtest-alpha-v1.1"))
      .toEqual(parsePlaytestAlphaPoiSection(actOne, fixture.page));
    const duplicated = { ...fixture.page, items: [...fixture.page.items,
      { text: ACT_TWO_TOOL_SOURCES.laboratory.label + " · Sequência mínima: 5", x: 74, y: 510, height: 9, order: 20 },
      { text: "Outra leitura.", x: 220, y: 510, height: 8, order: 21 }] };
    expect(() => parsePlaytestAlphaPoiSection(fixture.source, duplicated, "playtest-alpha-v1.1")).toThrow(/ambígua/);
  });
  it("configures six laboratories, shares the knife length, and leaves Wardrobe/Idol Radio manual", () => {
    const presets = syntheticToolPresets();
    const laboratory = ACT_TWO_TOOL_BINDINGS.filter(binding => binding.tool === "laboratory");
    expect(laboratory.map(binding => [binding.poiId, binding.sequenceLength])).toEqual([
      ["actTwo.map.03", 5], ["actTwo.map.06", 4], ["actTwo.map.07", 6], ["actTwo.map.08", 5], ["actTwo.map.11", 4], ["actTwo.map.25", 5],
    ]);
    const wardrobe = presets.find(preset => preset.id === "actTwo.map.23")!;
    const idol = presets.find(preset => preset.id === "actTwo.map.07")!;
    expect(wardrobe.gmContext).toContain("não fornece comprimento");
    expect(wardrobe.information.some(entry => entry.id.includes(".tool.laboratory"))).toBe(false);
    expect(idol.gmContext).toContain("sem puzzle ordenável");
    expect(idol.information.some(entry => entry.id.includes(".tool.radio"))).toBe(false);
    expect(presets.find(preset => preset.id === "actTwo.map.25")?.information.at(-1)?.availability.mode).toBe("situational");
    const fixture = syntheticToolSection("actTwo.map.03");
    fixture.page.items = fixture.page.items.map(item => ({ ...item, text: item.text.replace("mínima: 5", "mínima: 4") }));
    expect(() => parsePlaytestAlphaPoiSection(fixture.source, fixture.page, "playtest-alpha-v1.1")).toThrow(/Comprimento/);
  });
  it("extracts Radio order/classification/punctuation and checks its solution and exact Altar correction", () => {
    const presets = syntheticToolPresets();
    for (const binding of ACT_TWO_TOOL_BINDINGS.filter(binding => binding.radio)) {
      const approach = presets.find(preset => preset.id === binding.poiId)!.information.at(-1)?.approaches[0];
      const radio = presets.find(preset => preset.id === binding.poiId)!.information.find(entry => entry.id.endsWith(".tool.radio"))!.approaches[0];
      expect(approach).toBeDefined();
      if (!isToolApproach(radio) || radio.mechanicConfig?.type !== "radio") throw new Error("Missing Radio");
      const config = radio.mechanicConfig;
      expect(config.trueFragments).toEqual(binding.radio!.trueOrder.map(index => binding.radio!.correction?.index === index
        ? "SUA FILHA," : `Trecho ${index}!`));
      expect(config.trueFragments.length + config.falseFragments.length).toBe(binding.radio!.pieceCount);
      expect(config.falseFragments).toHaveLength(binding.radio!.pieceCount - binding.radio!.trueOrder.length);
    }
    const fixture = syntheticToolSection("actTwo.map.08");
    fixture.page.items = fixture.page.items.map(item => ({ ...item, text: item.text.replace("SEU FILHO,", "OUTRO TEXTO,") }));
    expect(() => parsePlaytestAlphaPoiSection(fixture.source, fixture.page, "playtest-alpha-v1.1")).toThrow(/Puzzle/);
    for (const edit of [(text: string) => text.replace("Trecho 7!", ""),
      (text: string) => text.replace(/Solução:.*/, "Solução: “Mensagem divergente.”")]) {
      const f = syntheticToolSection("actTwo.map.13");
      f.page.items = f.page.items.map(item => ({ ...item, text: edit(item.text) }));
      expect(() => parsePlaytestAlphaPoiSection(f.source, f.page, "playtest-alpha-v1.1")).toThrow(/Puzzle/);
    }
  });
  it("uses current matching: burst only, situational answers excluded, Radio requires its compatible puzzle", () => {
    const presets = syntheticToolPresets();
    const victor = presets.find(preset => preset.id === "actTwo.map.05")!;
    const uv = ACT_TWO_TOOL_SOURCES.ultraviolet;
    expect(toolInformationIds(victor.information, new Set<string>(), uv.equipmentUuid, "illuminate")).toEqual([]);
    expect(toolInformationIds(victor.information, new Set<string>(), uv.equipmentUuid, uv.useFormId)).toEqual(["actTwo.map.05.tool.ultraviolet"]);
    const knife = presets.find(preset => preset.id === "actTwo.map.06")!;
    const lab = ACT_TWO_TOOL_SOURCES.laboratory;
    expect(toolInformationIds(knife.information, new Set<string>(), lab.equipmentUuid, lab.useFormId, 4)).toEqual(["actTwo.map.06.tool.laboratory"]);
    const idol = presets.find(preset => preset.id === "actTwo.map.07")!;
    expect(toolInformationIds(idol.information, new Set<string>(), lab.equipmentUuid, lab.useFormId, 6)).toEqual([]);
    const altar = presets.find(preset => preset.id === "actTwo.map.08")!;
    const radio = altar.information.find(entry => entry.id.endsWith(".tool.radio"))!.approaches[0];
    if (!isToolApproach(radio) || radio.mechanicConfig?.type !== "radio") throw new Error("Missing Radio");
    expect(toolInformationIds(altar.information, new Set<string>(), radio.equipmentUuid, radio.useFormId)).toEqual([]);
    expect(radioInformationIds(altar.information, new Set<string>(), radio.equipmentUuid, radio.useFormId, radio.mechanicConfig)).toEqual(["actTwo.map.08.tool.radio"]);
    expect(radioInformationIds(altar.information, new Set(["actTwo.map.08.tool.radio"]), radio.equipmentUuid, radio.useFormId, radio.mechanicConfig)).toEqual([]);
  });
});

it.skipIf(!process.env.PLAYTEST_ALPHA_V11_AGENTS_PDF)("verifies the complete local PDF without distributing its text", async () => {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = getDocument({ data: new Uint8Array(await readFile(process.env.PLAYTEST_ALPHA_V11_AGENTS_PDF!)) });
  try {
    const pdf = await task.promise;
    const pages = [];
    for (let number = 82; number <= 100; number++) {
      const text = await (await pdf.getPage(number)).getTextContent();
      pages.push({ number, items: text.items.flatMap((item, order) => "str" in item && item.str.trim()
        ? [{ text: item.str, x: item.transform[4], y: item.transform[5], height: item.height, order }] : []) });
    }
    const actual = parsePlaytestAlphaPois(pages, ["actTwo"], "playtest-alpha-v1.1");
    expect(actual).toHaveLength(25);
    expect(actual.flatMap(preset => preset.information.filter(entry => entry.id.includes(".tool.")))).toHaveLength(34);
    actual.forEach(preset => {
      const source = PLAYTEST_ALPHA_POI_SOURCES.find(source => source.id === preset.id)!;
      expect(new Set(preset.information.filter(entry => !entry.id.includes(".tool.")).map(entry => entry.id)))
        .toEqual(new Set([...source.informationIds, ...source.situationalInformation?.map(binding => binding.id) ?? []]));
    });
    expect(actual.find(preset => preset.id === "actTwo.map.13")!.information.find(entry => entry.id === "cameraTraces")?.availability.mode).toBe("situational");
    expect(actual.find(preset => preset.id === "actTwo.map.14")!.information.find(entry => entry.id === "revealedRitual")?.availability.mode).toBe("situational");
  } finally { await task.destroy(); }
});
