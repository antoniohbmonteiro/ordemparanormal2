import { ABILITY_CARD_KIND, ABILITY_ITEM_TYPE, CARD_PRESENTATION_FLAG, SYSTEM_ID } from "../../../config/system-config";
import type { AbilityUseResult } from "../../../features/abilities/use-ability";
import { buildAbilityCardViewModel, type AbilityCardViewModel } from "../../../ui/chat/ability-card-view-model";
import { readAgentAccentColor } from "../actors/read-agent-accent-color";
import { ensureSharedPartialsLoaded } from "../templates/ensure-shared-partials-loaded";

const ABILITY_CARD_TEMPLATE = `systems/${SYSTEM_ID}/templates/chat/ability-card.hbs`;
type AbilityExecution = Extract<AbilityUseResult, { readonly status: "success" }>;

function readRawDescription(system: unknown): string {
  if (!system || typeof system !== "object") return "";
  const description = (system as { readonly description?: unknown }).description;
  return typeof description === "string" ? description : "";
}

export async function buildAbilityCardContext(ability: foundry.documents.Item, execution?: AbilityExecution): Promise<AbilityCardViewModel> {
  const rawDescription = execution?.use.description ?? readRawDescription(ability.system);
  const description = await foundry.applications.ux.TextEditor.implementation.enrichHTML(rawDescription, { relativeTo: ability, secrets: ability.isOwner });
  const subtitle = execution?.use.name ?? game.i18n.localize("ORDEMPARANORMAL2.AbilityCard.Subtitle");
  const costLabel = execution && execution.source !== "none"
    ? `${execution.amount} ${game.i18n.localize(execution.source === "determination" ? "ORDEMPARANORMAL2.AgentSheet.Resources.Determination" : "ORDEMPARANORMAL2.AgentSheet.Abilities.Resource")}`
    : "";
  return buildAbilityCardViewModel({
    name: ability.name,
    img: ability.img ?? "",
    subtitle,
    description,
    ...(execution ? { cost: { source: execution.source, amount: execution.amount, label: costLabel } } : {}),
  });
}

export async function publishAbilityMessage(actor: foundry.documents.Actor, ability: foundry.documents.Item, execution?: AbilityExecution): Promise<void> {
  if (ability.type !== ABILITY_ITEM_TYPE) return;
  const accentColor = readAgentAccentColor(actor);
  await ensureSharedPartialsLoaded();
  const content = await foundry.applications.handlebars.renderTemplate(ABILITY_CARD_TEMPLATE, await buildAbilityCardContext(ability, execution));
  await ChatMessage.create({
    content,
    speaker: ChatMessage.getSpeaker({ actor }),
    flags: { [SYSTEM_ID]: { [CARD_PRESENTATION_FLAG]: { card: ABILITY_CARD_KIND, accentColor } } },
  });
}
