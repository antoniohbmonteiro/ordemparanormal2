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
