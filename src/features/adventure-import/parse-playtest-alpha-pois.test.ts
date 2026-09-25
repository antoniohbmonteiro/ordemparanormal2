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
    expect(preset.gmContext).toContain(`<li><p><strong>Pesquisar (requer pista anterior) · DT 8:</strong> Contexto "restrito", d'água &amp; &lt;sinal&gt;.</p></li>`);
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

  it("keeps catalog context rows as neutral GM context, apart from conditional rows", () => {
    const preset = parsePlaytestAlphaPoiSection({ ...source, informationIds: ["ordinary"], contextRowIndexes: [1] }, page([
      { skill: "Percepção", difficulty: 6, information: "Pista pública." },
      { skill: "Percepção", difficulty: 6, information: "Linha repetida." },
      { skill: "Intuição (apenas Ana)", difficulty: 8, information: "Pista condicional." },
    ]));
    expect(preset.information.map(entry => [entry.id, entry.content])).toEqual([["ordinary", "Pista pública."]]);
    expect(preset.gmContext).toBe("<ul><li><p><strong>Percepção · DT 6:</strong> Linha repetida.</p></li></ul>"
      + "<h3>INFORMAÇÕES CONDICIONAIS</h3><ul><li><p><strong>Intuição (apenas Ana) · DT 8:</strong> Pista condicional.</p></li></ul>");
    const conditionalSection = preset.gmContext.slice(preset.gmContext.indexOf("<h3>INFORMAÇÕES CONDICIONAIS</h3>"));
    expect(conditionalSection).not.toContain("Linha repetida.");
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
    expect(preset.gmContext).toContain("<li><p><strong>Intuição (apenas Victor e Alan) · DT 4:</strong> Memória pessoal.</p></li>");
    expect(preset.gmContext).toContain("<li><p><strong>Pesquisar (requer ter encontrado a foto) · DT 6:</strong> Uma data no verso.</p></li>");
    expect(preset.gmContext).toContain("<li><p><strong>Pesquisar (requer ter encontrado a foto) · DT 10:</strong> Um nome na vela.</p></li>");
    expect(preset.gmContext).toContain("<p>Nota do mestre.</p>");
    expect(allText(preset)).not.toMatch(/CONTINUA[ÇC][ÃA]O/iu);
  });

  it("keeps every row of a conditional section in GM context with its own skill", () => {
    const [first, next] = continuedTable([{ text: "(requer ter aberto a sala)", x: 224, y: 259, height: 10.5 }]);
    const preset = parsePlaytestAlphaPoiSection({ ...source, informationIds: [] }, first, next);
    expect(preset.information).toEqual([]);
    expect(preset.publicDescription).toBe("");
    const rows = [...preset.gmContext.matchAll(/<strong>([^<·]+) · DT (\d+):<\/strong>/gu)].map(match => `${match[1].trim()}/${match[2]}`);
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
      { text: "O sangue é antigo.", x: 147, y: 311 },
    ]));
    expect(preset.publicDescription).toBe("<p>Uma faca longa.</p>");
    expect(preset.gmContext).toBe("<h3>FERRAMENTAS</h3><ul><li><p><strong>Laboratório Portátil:</strong> O sangue é antigo.</p></li></ul>");
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
    expect(preset.gmContext).toBe("<ul><li><p>Anotação à mão.</p></li></ul>");
  });

  describe("GM context structure", () => {
    it("groups an access challenge, keeps GM paragraphs apart and lists conditional rows", () => {
      const preset = parsePlaytestAlphaPoiSection({ ...source, informationIds: ["keys"] }, layout(38, [
        { text: "SALA DE TESTE", x: 94, y: 621, height: 10 },
        { text: "Um depósito trancado.", x: 94, y: 608, height: 9 },
        { text: "DESAFIO", x: 79, y: 572, height: 9 }, { text: "DE ACESSO", x: 68.5, y: 560, height: 9 },
        { text: "\u008a", x: 68.5, y: 548, height: 9 }, { text: "PORTA", x: 74.6, y: 548, height: 9 },
        { text: "TRANCADA", x: 68.5, y: 536, height: 9 },
        { text: "ARROMBAR (DT 10, PA 10)", x: 136, y: 574, height: 9 },
        { text: "DESTRANCAR (senha: 3", x: 136, y: 555, height: 9 }, { text: "d6", x: 240, y: 554, height: 14 },
        { text: ", 3 tentativas)", x: 250, y: 555, height: 9 },
        { text: "Perícia", x: 63, y: 517 }, { text: "DT", x: 135, y: 517 }, { text: "Informação", x: 158.6, y: 517 },
        { text: "Percepção", x: 63, y: 492 }, { text: "6", x: 138.6, y: 492 }, { text: "Chaves & <cadeados>.", x: 158.6, y: 492 },
        { text: "Intuição (apenas Ana)", x: 63, y: 460 }, { text: "6", x: 138.6, y: 460 }, { text: "Um arrepio.", x: 158.6, y: 460 },
        { text: "Primeiro parágrafo do mestre,", x: 103, y: 427, height: 9 },
        { text: "que continua aqui.", x: 103, y: 414, height: 9 },
        { text: "Segundo parágrafo.", x: 103, y: 395, height: 9 },
      ]));
      expect(preset.gmContext).toBe("<h3>DESAFIO DE ACESSO: PORTA TRANCADA</h3>"
        + "<ul><li><p>ARROMBAR (DT 10, PA 10)</p></li><li><p>DESTRANCAR (senha: 3d6, 3 tentativas)</p></li></ul>"
        + "<h3>CONTEXTO</h3><p>Primeiro parágrafo do mestre, que continua aqui.</p><p>Segundo parágrafo.</p>"
        + "<h3>INFORMAÇÕES CONDICIONAIS</h3><ul><li><p><strong>Intuição (apenas Ana) · DT 6:</strong> Um arrepio.</p></li></ul>");
      expect(preset.publicDescription).toBe("<p>Um depósito trancado.</p>");
      expect(preset.information).toEqual([{ id: "keys", content: "Chaves & <cadeados>.",
        approaches: [{ skill: "perception", difficulty: 6, showDifficultyToPlayers: false }] }]);
    });

    it("pairs each tool label with its explanation, including multi-part labels", () => {
      const preset = parsePlaytestAlphaPoiSection({ ...source, informationIds: [] }, layout(85, [
        { text: "SALA DE TESTE", x: 105, y: 370, height: 10 },
        { text: "Uma faca.", x: 105, y: 357, height: 9 },
        { text: "FERRAMENTAS", x: 264, y: 337 },
        { text: "Laboratório", x: 74, y: 318, height: 9 }, { text: "Portátil", x: 74, y: 305, height: 9 },
        { text: "Sequência", x: 74, y: 287, height: 9 }, { text: "Mínima: 4", x: 74, y: 274, height: 9 },
        { text: "O sangue é de", x: 147, y: 303 }, { text: "alguém & <outro>.", x: 147, y: 289 },
        { text: "Leitor", x: 74, y: 256, height: 9 }, { text: "Infravermelho", x: 74, y: 243, height: 9 },
        { text: "Movimentos violentos.", x: 147, y: 255 }, { text: "Rastro fantasma.", x: 147, y: 243 },
        { text: "A faca foi usada.", x: 115, y: 215, height: 9 },
      ]));
      expect(preset.gmContext).toBe("<h3>FERRAMENTAS</h3><ul>"
        + "<li><p><strong>Laboratório Portátil · Sequência Mínima: 4:</strong> O sangue é de alguém &amp; &lt;outro&gt;.</p></li>"
        + "<li><p><strong>Leitor Infravermelho:</strong> Movimentos violentos. Rastro fantasma.</p></li></ul>"
        + "<h3>CONTEXTO</h3><p>A faca foi usada.</p>");
    });

    it("keeps a tools note without tool labels as a paragraph", () => {
      const preset = parsePlaytestAlphaPoiSection({ ...source, informationIds: [] }, layout(95, [
        { text: "SALA DE TESTE", x: 143, y: 541, height: 10 },
        { text: "Quatro pôsteres.", x: 143, y: 528, height: 9 },
        { text: "FERRAMENTAS", x: 277, y: 508 },
        { text: "Todas as ferramentas resultam em leitura normal.", x: 145, y: 490 },
        { text: "Os pôsteres não têm nada relevante.", x: 145, y: 463, height: 9 },
      ]));
      expect(preset.gmContext).toBe("<h3>FERRAMENTAS</h3><p>Todas as ferramentas resultam em leitura normal.</p>"
        + "<h3>CONTEXTO</h3><p>Os pôsteres não têm nada relevante.</p>");
    });

    it("keeps unstructured GM text as plain paragraphs", () => {
      const preset = parsePlaytestAlphaPoiSection({ ...source, informationIds: ["ordinary"] }, layout(35, [
        { text: "SALA DE TESTE", x: 70, y: 700, height: 11 },
        { text: "Uma sala.", x: 70, y: 686 },
        { text: "Perícia", x: 70, y: 650 }, { text: "DT", x: 150, y: 650 }, { text: "Informação", x: 180, y: 650 },
        { text: "Percepção", x: 70, y: 620 }, { text: "6", x: 150, y: 620 }, { text: "Pista.", x: 180, y: 620 },
        { text: "Primeira nota", x: 90, y: 580, height: 9 }, { text: "do mestre.", x: 90, y: 567, height: 9 },
        { text: "Segunda nota.", x: 90, y: 548, height: 9 },
      ]));
      expect(preset.gmContext).toBe("<p>Primeira nota do mestre.</p><p>Segunda nota.</p>");
      expect(preset.information.every(entry => !/<[a-z]/iu.test(entry.content))).toBe(true);
    });

    it("keeps printed titles and bullet lists in reading order and stops at pages without a continuation", () => {
      const preset = parsePlaytestAlphaPoiSection({ ...source, informationIds: [] }, layout(58, [
        { text: "SALA DE TESTE", x: 98, y: 706, height: 10 },
        { text: "Um freezer.", x: 98, y: 693, height: 9 },
        { text: "CONTEÚDO", x: 253, y: 592, height: 9 },
        { text: "Ao abrir, há:", x: 67, y: 574, height: 9 },
        { text: "\u008a", x: 67, y: 561, height: 9 }, { text: "Uma chave.", x: 75.5, y: 561, height: 9 },
        { text: "\u008a", x: 67, y: 548, height: 9 }, { text: "Um bilhete", x: 75.5, y: 548, height: 9 },
        { text: "dobrado.", x: 75.5, y: 535, height: 9 },
        { text: "Nota do mestre.", x: 108, y: 500, height: 9 },
      ]), layout(59, [
        { text: "OUTRO CAPÍTULO", x: 68, y: 690, height: 36 },
        { text: "Texto de outra seção.", x: 68, y: 665, height: 10.5 },
      ]));
      expect(preset.gmContext).toBe("<h3>CONTEÚDO</h3><p>Ao abrir, há:</p><ul><li><p>Uma chave.</p></li><li><p>Um bilhete dobrado.</p></li></ul>"
        + "<h3>CONTEXTO</h3><p>Nota do mestre.</p>");
    });
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
