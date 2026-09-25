import { describe, expect, it } from "vitest";
import type { AdventurePdfTextPage } from "../../adapters/files/read-adventure-poi-pages";
import type { AdventurePoiSource } from "../../config/adventure-poi-sources/playtest-alpha";
import { parsePlaytestAlphaPoiSection } from "./parse-playtest-alpha-pois";

const source: AdventurePoiSource = { id: "actOne.test", act: "actOne", heading: "Sala de Teste",
  informationIds: ["ordinary", "alternatives"] };

function page(rows: readonly { skill: string; difficulty: number; information: string }[],
  description = "Uma sala & seus objetos."): AdventurePdfTextPage {
  const items: Array<{ text: string; x: number; y: number; height: number; order: number }> = [];
  function add(text: string, x: number, y: number, height = 8) {
    items.push({ text, x, y, height, order: items.length });
  }
  add("SALA DE TESTE", 70, 700, 11);
  add(description, 70, 686);
  add("Perícia", 70, 650); add("DT", 150, 650); add("Informação", 180, 650);
  rows.forEach((row, index) => {
    const y = 620 - index * 35;
    add(row.skill, 70, y); add(String(row.difficulty), 150, y);
    add(row.information, 180, y);
  });
  return { number: 35, items };
}

type FixtureItem = { readonly text: string; readonly x: number; readonly y: number; readonly height?: number };
function layout(number: number, items: readonly FixtureItem[]): AdventurePdfTextPage {
  return { number, items: items.map((item, order) => ({ height: 8, ...item, order })) };
}
const controlOrPrivateUse = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f-]/u;
const allText = (preset: { publicDescription: string; gmContext: string; information: readonly { content: string }[] }) =>
  [preset.publicDescription, preset.gmContext, ...preset.information.map(entry => entry.content)].join("\n");

// A table that starts under the heading and continues on the next page, where the header is not repeated
// and the columns sit at another indentation.
function continuedTable(headingSuffix: FixtureItem[] = []): AdventurePdfTextPage[] {
  return [layout(58, [
    { text: "SALA DE TESTE", x: 117, y: 261, height: 10 }, ...headingSuffix,
    { text: "Um corpo sobre a mesa.", x: 117, y: 248, height: 9 },
    { text: "Perícia", x: 85.5, y: 201 }, { text: "DT", x: 158.1, y: 201 }, { text: "Informação", x: 181.2, y: 201 },
    { text: "Percepção", x: 85.5, y: 170 }, { text: "6", x: 161.3, y: 170 }, { text: "Pista visível.", x: 181.2, y: 170 },
  ]), layout(59, [
    { text: "SALA DE TESTE (CONTINUAÇÃO)", x: 64, y: 706, height: 10 },
    { text: "Intuição", x: 65.7, y: 679 }, { text: "(apenas", x: 65.7, y: 666 }, { text: "Victor e Alan)", x: 65.7, y: 653 },
    { text: "4", x: 151, y: 668 }, { text: "Memória pessoal.", x: 171, y: 668 },
    { text: "Intuição", x: 65.7, y: 626 }, { text: "6", x: 151, y: 626 }, { text: "Um arrepio no símbolo.", x: 171, y: 626 },
    { text: "Medicina ou", x: 65.7, y: 599 }, { text: "Sobrevivência", x: 65.7, y: 586 },
    { text: "6", x: 151, y: 593 }, { text: "Três ferimentos.", x: 171, y: 599 },
    { text: "Pesquisar", x: 65.7, y: 549 }, { text: "(requer ter", x: 65.7, y: 536 }, { text: "encontrado a foto)", x: 65.7, y: 523 },
    { text: "6", x: 151, y: 554 }, { text: "Uma data no verso.", x: 171, y: 554 },
    { text: "10", x: 149, y: 510 }, { text: "Um nome na vela.", x: 171, y: 510 },
    { text: "Aptidão", x: 65.7, y: 461 }, { text: "(Atualidades)", x: 65.7, y: 448 },
    { text: "6", x: 151, y: 471 }, { text: "Uma tradição de prata.", x: 171, y: 471 },
    { text: "10", x: 149, y: 439 }, { text: "Uma data de casamento.", x: 171, y: 439 },
    { text: "Nota do mestre.", x: 106, y: 406, height: 9 },
  ])];
}

describe("Playtest Alpha POI parser", () => {
  it("uses Foundry-stable HTML text without encoding quotes and leaves information as plain text", () => {
    const fixture = { ...source, informationIds: ["ordinary"] };
    const preset = parsePlaytestAlphaPoiSection(fixture, page([
      { skill: "Percepção", difficulty: 6, information: `Texto "claro", d'água & <sinal>.` },
      { skill: "Pesquisar (requer pista anterior)", difficulty: 8,
        information: `Contexto "restrito", d'água & <sinal>.` },
    ], `Uma "sala", d'água & <sinal>.`));
    expect(preset.publicDescription).toBe(`<p>Uma "sala", d'água &amp; &lt;sinal&gt;.</p>`);
    expect(preset.gmContext).toContain(`<p>Pesquisar (requer pista anterior) · DT 8: Contexto "restrito", d'água &amp; &lt;sinal&gt;.</p>`);
    expect(preset.information[0].content).toBe(`Texto "claro", d'água & <sinal>.`);
    expect(`${preset.publicDescription}${preset.gmContext}`).not.toMatch(/&quot;|&#39;/u);
  });

  it("persists ordinary and alternative approaches, but keeps prerequisites only in GM context", () => {
    const preset = parsePlaytestAlphaPoiSection(source, page([
      { skill: "Percepção", difficulty: 6, information: "Informação <pública>." },
      { skill: "Medicina ou Sobrevivência", difficulty: 8, information: "Vestígio comum." },
      { skill: "Pesquisar (requer pista anterior)", difficulty: 6, information: "Segredo bloqueado." },
      { skill: "Intuição (apenas Victor e Alan)", difficulty: 8, information: "Memória pessoal." },
      { skill: "Tecnologia", difficulty: 10, information: "(Requer acesso prévio) Arquivo fechado." },
      { skill: "Pesquisar", difficulty: 8, information: "3 jogadores: Variante do grupo." },
    ]));
    expect(preset.information.map(entry => entry.id)).toEqual(["ordinary", "alternatives"]);
    expect(preset.information[0].content).toContain("Informação <pública>.");
    expect(preset.publicDescription).toContain("&amp;");
    expect(preset.information[1].approaches.map(approach => approach.skill)).toEqual(["medicine", "survival"]);
    expect(preset.information[1].approaches.every(approach => approach.showDifficultyToPlayers === false)).toBe(true);
    expect(preset.gmContext).toContain("requer pista anterior");
    expect(preset.gmContext).toContain("apenas Victor e Alan");
    expect(preset.gmContext).toContain("Requer acesso prévio");
    expect(preset.gmContext).toContain("3 jogadores");
    expect(preset.information.map(entry => entry.content).join(" ")).not.toMatch(/Segredo|Memória|Arquivo|Variante/u);
  });

  it("requires a canonical Aptitude specialization", () => {
    const specialized = { ...source, informationIds: ["aptitude"] };
    const preset = parsePlaytestAlphaPoiSection(specialized, page([
      { skill: "Aptidão (Humanas)", difficulty: 8, information: "Referência histórica." },
    ]));
    expect(preset.information[0].approaches).toEqual([{
      skill: "aptitude", specialization: "humanities", difficulty: 8, showDifficultyToPlayers: false,
    }]);
    expect(() => parsePlaytestAlphaPoiSection(specialized, page([
      { skill: "Aptidão (Inventada)", difficulty: 8, information: "Inválida." },
    ]))).toThrow();
  });

  it("reads each skill of a table continued on a headerless, re-indented page", () => {
    const [first, next] = continuedTable();
    const preset = parsePlaytestAlphaPoiSection({ ...source,
      informationIds: ["seen", "shiver", "wounds", "silver", "wedding"] }, first, next);
    expect(preset.information.map(entry => [entry.id, entry.approaches.map(approach =>
      "specialization" in approach ? `${approach.skill}:${approach.specialization}` : approach.skill), entry.content])).toEqual([
      ["seen", ["perception"], "Pista visível."],
      ["shiver", ["intuition"], "Um arrepio no símbolo."],
      ["wounds", ["medicine", "survival"], "Três ferimentos."],
      ["silver", ["aptitude:currentAffairs"], "Uma tradição de prata."],
      ["wedding", ["aptitude:currentAffairs"], "Uma data de casamento."],
    ]);
    expect(preset.gmContext).toContain("<p>Intuição (apenas Victor e Alan) · DT 4: Memória pessoal.</p>");
    expect(preset.gmContext).toContain("<p>Pesquisar (requer ter encontrado a foto) · DT 6: Uma data no verso.</p>");
    expect(preset.gmContext).toContain("<p>Pesquisar (requer ter encontrado a foto) · DT 10: Um nome na vela.</p>");
    expect(preset.gmContext).toContain("<p>Nota do mestre.</p>");
    expect(allText(preset)).not.toMatch(/CONTINUA[ÇC][ÃA]O/iu);
  });

  it("keeps every row of a conditional section in GM context with its own skill", () => {
    const [first, next] = continuedTable([{ text: "(requer ter aberto a sala)", x: 224, y: 259, height: 10.5 }]);
    const preset = parsePlaytestAlphaPoiSection({ ...source, informationIds: [] }, first, next);
    expect(preset.information).toEqual([]);
    expect(preset.publicDescription).toBe("");
    const rows = [...preset.gmContext.matchAll(/<p>([^<·]+) · DT (\d+):/gu)].map(match => `${match[1].trim()}/${match[2]}`);
    expect(rows).toEqual(["Percepção/6", "Intuição (apenas Victor e Alan)/4", "Intuição/6", "Medicina ou Sobrevivência/6",
      "Pesquisar (requer ter encontrado a foto)/6", "Pesquisar (requer ter encontrado a foto)/10",
      "Aptidão (Atualidades)/6", "Aptidão (Atualidades)/10"]);
    expect(allText(preset)).not.toMatch(/CONTINUA[ÇC][ÃA]O/iu);
  });

  it.each(["DESAFIO", "BLOQUEIO"])("keeps a %s access block out of the public description", label => {
    const preset = parsePlaytestAlphaPoiSection({ ...source, informationIds: ["keys"] }, layout(38, [
      { text: "SALA DE TESTE", x: 94, y: 621, height: 10 },
      { text: "Um depósito com uma porta", x: 94, y: 608, height: 9 },
      { text: "trancada e estantes vazias.", x: 94, y: 595, height: 9 },
      { text: "13", x: 300, y: 602, height: 18 },
      { text: label, x: 79, y: 572, height: 9 }, { text: "DE ACESSO", x: 68.5, y: 560, height: 9 },
      { text: "PORTA", x: 74.6, y: 548, height: 9 },
      { text: "ARROMBAR (DT 10, PA 10)", x: 136, y: 574.2, height: 9 },
      { text: "DESTRANCAR (senha: 3, 3 tentativas)", x: 136, y: 555, height: 9 },
      { text: "Perícia", x: 63, y: 517 }, { text: "DT", x: 135, y: 517 }, { text: "Informação", x: 158.6, y: 517 },
      { text: "Percepção", x: 63, y: 492 }, { text: "6", x: 138.6, y: 492 }, { text: "Chaves no chão.", x: 158.6, y: 492 },
    ]));
    expect(preset.publicDescription).toBe("<p>Um depósito com uma porta trancada e estantes vazias.</p>");
    expect(preset.gmContext).toContain(label);
    expect(preset.gmContext).toContain("ARROMBAR (DT 10, PA 10)");
    expect(allText(preset)).not.toMatch(/\b13\b/u);
    expect(preset.information.map(entry => entry.id)).toEqual(["keys"]);
  });

  it("keeps a tools block out of the public description", () => {
    const preset = parsePlaytestAlphaPoiSection({ ...source, informationIds: [] }, layout(85, [
      { text: "SALA DE TESTE", x: 105, y: 370, height: 10 },
      { text: "Uma faca longa.", x: 105, y: 357, height: 9 },
      { text: "06", x: 484, y: 360, height: 18 },
      { text: "FERRAMENTAS", x: 264, y: 337 },
      { text: "Laboratório", x: 74, y: 318, height: 9 }, { text: "Portátil", x: 74, y: 305, height: 9 },
      { text: "O sangue é antigo.", x: 147, y: 303 },
    ]));
    expect(preset.publicDescription).toBe("<p>Uma faca longa.</p>");
    expect(preset.gmContext).toContain("FERRAMENTAS");
    expect(preset.gmContext).toContain("O sangue é antigo.");
    expect(preset.gmContext).not.toContain("06");
  });

  it("ignores a neighbouring page column beside a POI placed in the right column", () => {
    const preset = parsePlaytestAlphaPoiSection({ ...source, informationIds: ["chair"] }, layout(54, [
      { text: "Se os jogadores acenderem a luz,", x: 68, y: 448, height: 10.5 },
      { text: "leia o trecho seguinte.", x: 68, y: 434, height: 10.5 },
      { text: "SALA DE TESTE", x: 338, y: 473, height: 10 },
      { text: "Uma mesa com cartas", x: 338, y: 460, height: 9 },
      { text: "e fichas.", x: 338, y: 447, height: 9 },
      { text: "18", x: 486, y: 457, height: 18 },
      { text: "Perícia", x: 307, y: 426 }, { text: "DT", x: 386, y: 426 }, { text: "Informação", x: 413, y: 426 },
      { text: "Percepção", x: 307, y: 383 }, { text: "6", x: 389, y: 383 }, { text: "Uma cadeira caída.", x: 413, y: 383 },
      { text: "A mesa era usada em jogos.", x: 353, y: 328, height: 9 },
      { text: "A lanterna é fraca.", x: 86, y: 326, height: 9 },
    ]));
    expect(preset.publicDescription).toBe("<p>Uma mesa com cartas e fichas.</p>");
    expect(preset.gmContext).toBe("<p>A mesa era usada em jogos.</p>");
    expect(preset.information.map(entry => [entry.id, entry.content])).toEqual([["chair", "Uma cadeira caída."]]);
  });

  it("drops control and private-use ornament glyphs but keeps Portuguese text", () => {
    const preset = parsePlaytestAlphaPoiSection({ ...source, informationIds: ["ordinary"] }, layout(35, [
      { text: "SALA DE TESTE", x: 70, y: 700, height: 11 },
      { text: "\u008aUma sala com decoração.", x: 70, y: 686 },
      { text: "Perícia", x: 70, y: 650 }, { text: "DT", x: 150, y: 650 }, { text: "Informação", x: 180, y: 650 },
      { text: "Percepção", x: 70, y: 620 }, { text: "6", x: 150, y: 620 }, { text: "\u008a Ação útil.", x: 180, y: 620 },
      { text: "\u008a", x: 90, y: 560, height: 9 }, { text: "Anotação à mão.", x: 98, y: 560, height: 9 },
    ]));
    expect(allText(preset)).not.toMatch(controlOrPrivateUse);
    expect(preset.publicDescription).toBe("<p>Uma sala com decoração.</p>");
    expect(preset.information[0].content).toBe("Ação útil.");
    expect(preset.gmContext).toBe("<p>Anotação à mão.</p>");
  });

  it("fails on malformed tables and unknown conditional qualifiers", () => {
    const malformed = page([]);
    expect(() => parsePlaytestAlphaPoiSection(source, malformed)).toThrow();
    const noInformationHeader = { ...malformed, items: malformed.items.filter(item => item.text !== "Informação") };
    expect(() => parsePlaytestAlphaPoiSection(source, noInformationHeader)).toThrow("Cabeçalho de quadro inválido");
    expect(() => parsePlaytestAlphaPoiSection({ ...source, informationIds: ["one"] }, page([
      { skill: "Percepção (qualificador desconhecido)", difficulty: 6, information: "Não persistir silenciosamente." },
    ]))).toThrow();
  });
});
