
import { assertBetaPdf, readBetaPages, withBetaArchive } from "../../adapters/files/read-playtest-beta";
import type { loadPdfJs } from "../../adapters/files/pdfjs-document";
import { BETA_AGENTS, BETA_MISSION_DATA, BETA_MISSIONS, BETA_POIS, BETA_THREATS,
  type BetaMissionId } from "../../config/adventure-definitions/playtest-beta";
import { betaReadingOrder, parseBetaAgent, parseBetaPoi, parseBetaThreat } from "./parse-playtest-beta";

const range = (first: number, last: number) => Array.from({ length: last - first + 1 }, (_, index) => first + index);

export async function preparePlaytestBeta(pdf: File, extras: Readonly<Partial<Record<BetaMissionId, File>>>,
  pdfJs?: Awaited<ReturnType<typeof loadPdfJs>>) {
  const missions = BETA_MISSIONS.filter(mission => extras[mission]);
  await assertBetaPdf(pdf);
  const issues: Partial<Record<BetaMissionId, string>> = {};
  if (!missions.length) return { detected: [], issues };
  const pages = await readBetaPages(pdf, 76, missions.flatMap(mission => range(BETA_MISSION_DATA[mission].pages[0], BETA_MISSION_DATA[mission].pages[1])), pdfJs);
  const detected = [];
  for (const mission of missions) {
    try {
      const definition = BETA_MISSION_DATA[mission];
      const file = extras[mission]!;
      const agents = await withBetaArchive(mission, file, async (read, paths) => {
        const sheet = await read(definition.sheet);
        for (const path of paths) if (path !== definition.sheet) await read(path);
        const references = BETA_AGENTS.filter(agent => agent.page < definition.sheetPages);
        const pages = await readBetaPages(sheet, definition.sheetPages, references.map(agent => agent.page), pdfJs);
        return references.map(agent => parseBetaAgent(pages.get(agent.page)!, agent));
      });
      const pois = BETA_POIS[mission].map(poi => parseBetaPoi(pages, poi));
      const threats = BETA_THREATS.filter(threat => threat.mission === mission)
        .map(threat => parseBetaThreat(pages.get(threat.page)!, threat));
      const narrative = definition.narrative.map(entry => ({
        name: entry.name,
        pages: entry.pages,
        text: range(entry.pages[0], entry.pages[1]).map(page => {
          const items = pages.get(page)!.items.filter(item => item.y > 42);
          return { page, text: betaReadingOrder(items) };
        }),
      }));
      detected.push({ mission, file, agents, pois, threats, narrative });
    } catch (error) {
      issues[mission] = error instanceof Error ? error.message : "Não foi possível analisar o ZIP.";
    }
  }
  if (detected.length === 2) {
    const [normal, elite] = detected;
    if (normal.agents.some((agent, index) => JSON.stringify(agent) !== JSON.stringify(elite.agents[index])))
      throw new Error("As fichas compartilhadas das duas missões divergem.");
  }
  return { detected, issues };
}

export type PreparedBetaMission = Awaited<ReturnType<typeof preparePlaytestBeta>>["detected"][number];
