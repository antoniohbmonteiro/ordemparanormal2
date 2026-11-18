import { BETA_POI_ROWS } from "./playtest-beta-poi-rows";

import { SKILL_DEFINITIONS } from "../../config/skills";
import { readSkillDie } from "../../core/actors/custom-skills";
import type { SkillDieStep } from "../../config/skills";
import type { AdventurePdfTextItem, AdventurePdfTextPage } from "../../adapters/files/read-adventure-poi-pages";
import { BETA_AGENTS, BETA_THREATS, type BetaPoiDefinition } from "../../config/adventure-definitions/playtest-beta";

type TextItem = AdventurePdfTextItem;
type Attribute = "physical" | "mind" | "emotion";
export type BetaAgentReference = typeof BETA_AGENTS[number];

export const BETA_APTITUDES = ["Artes", "Erudição", "Folclore", "Guerra", "Nobreza", "Religião"] as const;
export const normalizeBetaLabel = (value: string) => value.normalize("NFD").replace(/\p{Diacritic}/gu, "")
  .trim().replace(/\s+/gu, " ").toLowerCase();

const canonical = new Map<string, string>(SKILL_DEFINITIONS.filter(skill => !("specializations" in skill))
  .map(skill => [normalizeBetaLabel(skill.label), skill.key]));

export function betaSkillReference(label: string): { kind: "canonical" | "beta" | "pending"; key: string } | null {
  const normalized = normalizeBetaLabel(label);
  const key = canonical.get(normalized);
  if (key) return { kind: "canonical", key };
  if (["animais", "inspecionar", "oficio", "oficio (metalurgia)"].includes(normalized)) return { kind: "beta", key: normalized };
  const specialty = /^aptidao\s*\((.+)\)$/u.exec(normalized)?.[1];
  if (specialty && BETA_APTITUDES.some(name => normalizeBetaLabel(name) === specialty))
    return { kind: "beta", key: "aptitude." + specialty };
  if (["aptidao", "metalurgia", "bruxaria"].includes(normalized))
    return { kind: "pending", key: normalized };
  return null;
}

function one<T>(items: readonly T[], label: string): T {
  if (items.length !== 1) throw new Error("Referência Beta inválida ou ambígua: " + label + ".");
  return items[0];
}

function text(item: TextItem) { return item.text.trim(); }
function numeric(item: TextItem) { return /^\d+$/u.test(text(item)); }
function die(item: TextItem, style: "sheet" | "book") {
  const match = (style === "sheet" ? /^d(\d+)$/u : /^\d+_on_d(\d+)$/u).exec(text(item));
  return match ? readSkillDie(Number(match[1])) : undefined;
}

function resource(items: readonly TextItem[], label: string) {
  const anchor = one(items.filter(item => text(item) === label && item.y > 375 && item.y < 450), label);
  return Number(text(one(items.filter(item => numeric(item) && Math.abs(item.y - anchor.y) < 5
    && item.x > anchor.x + 16 && item.x < anchor.x + 44), label)));
}

export function betaReadingOrder(items: readonly TextItem[]): string {
  return items.map((item, index) => {
    const previous = items[index - 1];
    const separator = previous && Math.abs(previous.y - item.y) > 3 ? "\n" : " ";
    return separator + text(item).replace(/^(\d+)_on_d(\d+)$/u, "d$2");
  }).join("").replace(/[\u007f-\u009f]/gu, "").replace(/ -\n(?=\p{Ll})/gu, "").trim();
}

export function betaText(items: readonly TextItem[]): string {
  const rows: TextItem[][] = [];
  for (const item of [...items].sort((a, b) => b.y - a.y || a.x - b.x)) {
    const row = rows.at(-1);
    if (row && Math.abs(row[0].y - item.y) < 3) row.push(item);
    else rows.push([item]);
  }
  return rows.map(row => row.sort((a, b) => a.x - b.x).map(item => text(item)
    .replace(/^(\d+)_on_d(\d+)$/u, "d$2").replace(/[\u0000-\u001f\u007f-\u009f]/gu, "")).filter(Boolean).join(" "))
    .join("\n").replace(/ -\n(?=\p{Ll})/gu, "");
}

const agentAbilityAnchors = {
  rhiona: ["ANÁLISE", "LEITURA DE COMBATE", "SEGREDO DO AÇO"],
  rowan: ["PRONTIDÃO", "ESQUIVA", "ESPECTRO, O LOBO"],
  muirenn: ["ÍMPETO", "ARSENAL DE HERBORISTA"],
  cavan: ["ANÁLISE", "CURANDEIRO", "MENTORIA"],
  malik: ["ÍMPETO", "ÍMPETO FERVILHANTE"],
  sira: ["PRONTIDÃO", "ANTECIPAÇÃO TÁTICA", "SORRATEIRO"],
  sorcha: ["PRONTIDÃO", "GUARDIÃ", "INSTINTO DE SOBREVIVÊNCIA"],
  cormac: ["ÍMPETO", "HERANÇA", "PLANO ESTRATÉGICO"],
} as const;

export function parseBetaAgent(page: AdventurePdfTextPage, agent: BetaAgentReference) {
  const { items } = page;
  if (!items.some(item => text(item) === agent.anchor && item.y > 470))
    throw new Error("Identidade da ficha Beta divergente na página " + page.number + ".");
  const vocation = one(items.filter(item => /^•\s+.+\s+• NÍVEL$/u.test(text(item)) && item.y > 465), agent.name);
  const profile = one(items.filter(item => /^(ANALISTA|VIGILANTE|EXECUTOR)$/u.test(text(item)) && item.y > 465), agent.name);
  const level = Number(text(one(items.filter(item => numeric(item) && item.x > vocation.x && item.y > 465), "nível")));
  const attributes = items.filter(item => item.x > 240 && item.x < 310 && item.y > 365 && item.y < 440 && die(item, "sheet"))
    .sort((a, b) => b.y - a.y).map(item => die(item, "sheet")!);
  if (attributes.length !== 3 || level < 1 || level > 10) throw new Error("Atributos ou nível inválidos: " + agent.name + ".");
  const skills = items.filter(item => text(item) === "+" && item.x < 165 && item.y < 355).map(plus => {
    const label = text(one(items.filter(item => item.x < plus.x - 18 && Math.abs(item.y - plus.y) < 2.8
      && betaSkillReference(text(item))), "perícia na página " + page.number));
    const value = die(one(items.filter(item => item.x >= plus.x - 20 && item.x <= plus.x - 9
      && Math.abs(item.y - plus.y) < 4 && die(item, "sheet")), label), "sheet")!;
    return { label, die: value, reference: betaSkillReference(label)! };
  });
  if (skills.length < 20 || new Set(skills.map(skill => skill.reference.key)).size !== skills.length)
    throw new Error("Linhas de perícia inválidas: " + agent.name + ".");
  const equipment = one(items.filter(item => text(item) === "EQUIPAMENTO" && item.x > 200 && item.y < 150), "equipamento " + agent.name);
  const headings = agentAbilityAnchors[agent.id].map(label => one(items.filter(item =>
    text(item) === label && item.x > 200 && item.y < 420 && item.y > equipment.y), label)).sort((a, b) => b.y - a.y);
  const descriptionItems = items.filter(item => item.x > 200 && item.x < 568 && item.y < 420);
  const abilities = headings.map((heading, index) => ({ name: text(heading), description: betaText(descriptionItems.filter(item =>
    item.y < heading.y - 3 && item.y > (headings[index + 1] ?? equipment).y + 3)) }));
  return { ...agent, level, profile: text(profile), vocation: text(vocation).split("•")[1].trim(),
    attributes: { physical: attributes[0], mind: attributes[1], emotion: attributes[2] },
    health: resource(items, "PV"), determination: resource(items, "PD"), skills, abilities,
    equipment: betaText(descriptionItems.filter(item => item.y < equipment.y - 3 && item.y > 24)) };
}

export type PreparedBetaAgent = ReturnType<typeof parseBetaAgent>;

export function parseBetaThreat(page: AdventurePdfTextPage, threat: typeof BETA_THREATS[number]) {
  const { column, healthY } = threat;
  const items = page.items.filter(item => item.x >= column + 65 && item.x < column + 300);
  const health = Number(text(one(items.filter(item => Math.abs(item.y - healthY) < 2 && numeric(item)), threat.name)));
  const attributes = items.filter(item => Math.abs(item.y - (healthY - 30)) < 2 && die(item, "book"))
    .sort((a, b) => a.x - b.x).map(item => die(item, "book")!);
  if (attributes.length !== 3) throw new Error("Atributos inválidos: " + threat.name + ".");
  const actionsHeading = one(items.filter(item => text(item) === "AÇÕES" && item.y < healthY), threat.name);
  const skills = items.filter(item => item.y < healthY - 38 && item.y > actionsHeading.y + 3 && die(item, "book")).map(item => {
    const label = text(one(items.filter(entry => entry.x < item.x && item.x - entry.x < 90
      && Math.abs(entry.y - item.y) < 2 && betaSkillReference(text(entry).replace(/^,\s*/u, "")))
      .sort((a, b) => b.x - a.x).slice(0, 1), threat.name)).replace(/^,\s*/u, "");
    return { kind: "skill", key: betaSkillReference(label)!.key, die: die(item, "book")! };
  });
  if (skills.length < 2) throw new Error("Perícias inválidas: " + threat.name + ".");
  const attacks = items.filter(item => text(item) === "CORPO A CORPO." && item.y < actionsHeading.y);
  const actions = attacks.map((anchor, index) => {
    const row = items.filter(item => item.x > anchor.x && Math.abs(item.y - anchor.y) < 2).sort((a, b) => a.x - b.x);
    if (!row.length) throw new Error("Ação inválida: " + threat.name + ".");
    const description = betaText(row.slice(1)).replace(/\n/gu, " ");
    const rolled = row.flatMap(item => die(item, "book") ?? []);
    const fighting = skills.find(skill => skill.key === "fighting")?.die;
    const matches = rolled.length === 2 ? rolled[0] === attributes[0] && rolled[1] === fighting
      : rolled.length === 1 && row.some(item => text(item) === "2") && rolled[0] === attributes[0] && rolled[0] === fighting;
    const damage = /dano (RA\s*\+\s*\d+)/u.exec(description)?.[1]?.replace(/\s/gu, "");
    return { id: "attack-" + (index + 1), name: text(row[0]).replace(/\s*\(teste\s*$/u, ""), typeLabel: "Corpo a corpo",
      requirements: "", description,
      check: matches ? { kind: "skill", key: "fighting", attribute: "physical" } : null,
      damage: damage ? { expression: damage, timing: "immediate" } : null };
  });
  return { ...threat, health, attributes: { physical: attributes[0], mind: attributes[1], emotion: attributes[2] },
    skills, actions, notes: betaText(items.filter(item => item.y < (attacks.at(-1)?.y ?? actionsHeading.y) - 4 && item.y > 48)) };
}

export type PreparedBetaThreat = ReturnType<typeof parseBetaThreat>;

export interface BetaPoiRow {
  id: string;
  page: number;
  difficulty: number;
  labels: readonly string[];
  content: string;
}

export function parseBetaPoi(pages: ReadonlyMap<number, AdventurePdfTextPage>, definition: BetaPoiDefinition) {
  const rows: BetaPoiRow[] = [];
  const context: string[] = [];
  for (const section of definition.sections) {
    const items = pages.get(section.page)?.items.filter(item => item.y < section.top && item.y > section.bottom) ?? [];
    if (!items.length) throw new Error("Seção de POI Beta ausente: " + definition.name + ".");
    context.push(betaText(items));
    for (const selector of BETA_POI_ROWS[definition.id] ?? []) {
      if (selector.page !== section.page) continue;
      const marker = one(items.filter(item => item.x > 140 && item.x < 160 && numeric(item)
        && Math.abs(item.y - selector.difficultyY) < 1.1), definition.name);
      const content = betaText(items.filter(item => item.x >= 164 && item.y <= selector.top + 1.1
        && item.y >= selector.bottom - 1.1)).trim();
      if (!content || selector.labels.some(label => !betaSkillReference(label)))
        throw new Error("Linha de POI Beta inválida: " + definition.name + ".");
      rows.push({ id: definition.id + "-" + section.page + "-" + selector.difficultyY, page: section.page,
        difficulty: Number(text(marker)), labels: selector.labels, content });
    }
  }
  return { ...definition, rows, context: context.join("\n\n") };
}

export type PreparedBetaPoi = ReturnType<typeof parseBetaPoi>;
