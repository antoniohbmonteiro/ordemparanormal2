import type { AdventurePdfTextPage } from "../adapters/files/read-adventure-poi-pages";
import { PLAYTEST_ALPHA_POI_SOURCES } from "../config/adventure-poi-sources/playtest-alpha";
import { ACT_TWO_TOOL_BINDINGS, ACT_TWO_TOOL_SOURCES, ACT_TWO_MANUAL_TOOL_RESPONSES,
  type ActTwoRadioBinding } from "../config/adventure-poi-sources/playtest-alpha-act-two-tools";
import { parsePlaytestAlphaPoiSection } from "../features/adventure-import/parse-playtest-alpha-pois";

// Synthetic layout and puzzle text; no official paragraphs or complete official puzzle lists.
export function syntheticRadioText(binding: ActTwoRadioBinding): string {
  const pieces = Array.from({ length: binding.pieceCount }, (_value, index) => `Trecho ${index}!`);
  if (binding.correction) pieces[binding.correction.index] = binding.correction.from;
  const correct = [...pieces];
  if (binding.correction) correct[binding.correction.index] = binding.correction.to;
  return `Conjuntos de palavras (vermelhos indicam conjuntos falsos): ${pieces.map(piece => `“${piece}”`).join(" – ")} Solução: `
    + `Alan: “${binding.trueOrder.map(index => correct[index]).join(" ")}”`;
}

export function syntheticToolSection(poiId: string, reverse = false) {
  const original = PLAYTEST_ALPHA_POI_SOURCES.find(source => source.id === poiId)!;
  const source = { ...original, informationIds: ["legacy"], contextRowIndexes: [],
    situationalInformation: [{ row: 1, id: "legacyManual" }] };
  const rows = [
    ...ACT_TWO_TOOL_BINDINGS.filter(binding => binding.poiId === poiId).map(binding => ({
      label: ACT_TWO_TOOL_SOURCES[binding.tool].label + (binding.sequenceLength ? ` · Sequência mínima: ${binding.sequenceLength}` : ""),
      text: binding.radio ? syntheticRadioText(binding.radio) : "Leitura sintética. Referências PDI_TESTE_01, HANDOUT 04 e ÁUDIO EMF 1.",
    })),
    ...ACT_TWO_MANUAL_TOOL_RESPONSES.filter(binding => binding.poiId === poiId).map(binding => ({
      label: ACT_TWO_TOOL_SOURCES[binding.tool].label, text: "Orientação manual sintética.",
    })),
  ];
  if (reverse) rows.reverse();
  const items: AdventurePdfTextPage["items"][number][] = [];
  const add = (text: string, x: number, y: number, height = 8) => items.push({ text, x, y, height, order: items.length });
  add(source.heading.toLocaleUpperCase("pt-BR"), 105, 760, 10);
  add("Descrição sintética do local.", 105, 747, 9);
  add("Perícia", 70, 700); add("DT", 150, 700); add("Informação", 180, 700);
  add("Percepção", 70, 675); add("6", 150, 675); add("Pista original sintética.", 180, 675);
  add("Ocultismo (requer ferramenta)", 70, 635); add("6", 150, 635); add("Interpretação manual sintética.", 180, 635);
  add("FERRAMENTAS", 264, 597);
  rows.forEach((row, index) => {
    const y = 560 - index * 48;
    add(row.label, 74, y, 9); add(row.text, 220, y);
  });
  return { source, page: { number: 85, items } satisfies AdventurePdfTextPage };
}

export function syntheticToolPresets() {
  return PLAYTEST_ALPHA_POI_SOURCES.filter(source => source.act === "actTwo").map(source => {
    const fixture = syntheticToolSection(source.id);
    return parsePlaytestAlphaPoiSection(fixture.source, fixture.page, "playtest-alpha-v1.1");
  });
}
