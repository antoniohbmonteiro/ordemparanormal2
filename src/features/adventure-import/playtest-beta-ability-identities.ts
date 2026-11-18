
import type { PreparedBetaAgent } from "./parse-playtest-beta";

const assignments = {
  rhiona: ["analysis", "combat-reading", "steel-secret"],
  rowan: ["readiness", "dodge", "specter"],
  muirenn: ["impetus", "herbalist-arsenal"],
  cavan: ["analysis", "healer", "mentorship"],
  malik: ["impetus", "fervent-impetus"],
  sira: ["readiness", "tactical-anticipation", "stealthy"],
  sorcha: ["readiness", "guardian", "survival-instinct"],
  cormac: ["impetus", "heritage", "strategic-plan"],
} as const;

export type BetaAbilityId = (typeof assignments)[keyof typeof assignments][number];
export const BETA_CANONICAL_ABILITIES: Readonly<Record<BetaAbilityId, string>> = {
  mentorship: "Compendium.ordemparanormal2.abilities.Item.ability000000011",
  "analysis": "Compendium.ordemparanormal2.abilities.Item.ability000000019",
  "combat-reading": "Compendium.ordemparanormal2.abilities.Item.ability000000020",
  "steel-secret": "Compendium.ordemparanormal2.abilities.Item.ability000000021",
  "readiness": "Compendium.ordemparanormal2.abilities.Item.ability000000022",
  "dodge": "Compendium.ordemparanormal2.abilities.Item.ability000000023",
  "specter": "Compendium.ordemparanormal2.abilities.Item.ability000000024",
  "impetus": "Compendium.ordemparanormal2.abilities.Item.ability000000025",
  "herbalist-arsenal": "Compendium.ordemparanormal2.abilities.Item.ability000000026",
  "healer": "Compendium.ordemparanormal2.abilities.Item.ability000000027",
  "fervent-impetus": "Compendium.ordemparanormal2.abilities.Item.ability000000028",
  "tactical-anticipation": "Compendium.ordemparanormal2.abilities.Item.ability000000029",
  "stealthy": "Compendium.ordemparanormal2.abilities.Item.ability000000030",
  "guardian": "Compendium.ordemparanormal2.abilities.Item.ability000000031",
  "survival-instinct": "Compendium.ordemparanormal2.abilities.Item.ability000000032",
  "heritage": "Compendium.ordemparanormal2.abilities.Item.ability000000033",
  "strategic-plan": "Compendium.ordemparanormal2.abilities.Item.ability000000034",
};

const names: Record<BetaAbilityId, string> = {
  analysis: "Análise", "combat-reading": "Leitura de Combate", "steel-secret": "Segredo do Aço",
  readiness: "Prontidão", dodge: "Esquiva", specter: "Espectro, o Lobo", impetus: "Ímpeto",
  "herbalist-arsenal": "Arsenal de Herborista", healer: "Curandeiro", mentorship: "Mentoria",
  "fervent-impetus": "Ímpeto Fervilhante", "tactical-anticipation": "Antecipação Tática", stealthy: "Sorrateiro",
  guardian: "Guardiã", "survival-instinct": "Instinto de Sobrevivência", heritage: "Herança",
  "strategic-plan": "Plano Estratégico",
};

export function betaAgentAbilityIds(agent: PreparedBetaAgent): readonly BetaAbilityId[] {
  const ids = assignments[agent.id];
  if (agent.abilities.length !== ids.length || ids.some((id, index) =>
    names[id].toLocaleUpperCase("pt-BR") !== agent.abilities[index].name))
    throw new Error("A lista de habilidades da ficha Beta diverge: " + agent.name + ".");
  return ids;
}
