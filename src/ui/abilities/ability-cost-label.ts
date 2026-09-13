import type { AbilityCostData, AbilityCostSource } from "../../core/abilities/ability-cost";

const PAID_COST_LABEL_KEYS: Record<Exclude<AbilityCostSource, "none">, string> = {
  health: "ORDEMPARANORMAL2.AgentSheet.Resources.Health",
  determination: "ORDEMPARANORMAL2.AgentSheet.Resources.Determination",
  resource: "ORDEMPARANORMAL2.AgentSheet.Abilities.Resource",
};

export function localizeAbilityCost(cost: AbilityCostData): string {
  if (cost.source === "none") {
    return game.i18n.localize("ORDEMPARANORMAL2.AgentSheet.Abilities.NoCost");
  }
  return `${cost.amount} ${game.i18n.localize(PAID_COST_LABEL_KEYS[cost.source])}`;
}
