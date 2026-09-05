import {
  ABILITY_CARD_KIND,
  ABILITY_ITEM_TYPE,
  CARD_PRESENTATION_FLAG,
  SYSTEM_ID,
} from "../../../config/system-config";
import {
  buildAbilityCardViewModel,
  type AbilityCardViewModel,
} from "../../../ui/chat/ability-card-view-model";
import { readAgentAccentColor } from "../actors/read-agent-accent-color";
import { ensureChatCardPartialsLoaded } from "./ensure-chat-card-partials-loaded";

const ABILITY_CARD_TEMPLATE =
  `systems/${SYSTEM_ID}/templates/chat/ability-card.hbs`;

function readRawDescription(system: unknown): string {
  if (!system || typeof system !== "object") return "";
  const description = (system as { readonly description?: unknown }).description;
  return typeof description === "string" ? description : "";
}

export async function buildAbilityCardContext(
  ability: foundry.documents.Item,
): Promise<AbilityCardViewModel> {
  const { TextEditor } = foundry.applications.ux;
  const description = await TextEditor.implementation.enrichHTML(
    readRawDescription(ability.system),
    { relativeTo: ability, secrets: ability.isOwner },
  );

  return buildAbilityCardViewModel({
    name: ability.name,
    img: ability.img ?? "",
    description,
  });
}

/**
 * Posts a plain chat card with an Ability's name and description, spoken by the
 * owning Agent. Presentation only: it never rolls, spends, or mutates state.
 */
export async function publishAbilityMessage(
  actor: foundry.documents.Actor,
  ability: foundry.documents.Item,
): Promise<void> {
  if (ability.type !== ABILITY_ITEM_TYPE) return;

  const accentColor = readAgentAccentColor(actor);
  await ensureChatCardPartialsLoaded();
  const content = await foundry.applications.handlebars.renderTemplate(
    ABILITY_CARD_TEMPLATE,
    await buildAbilityCardContext(ability),
  );

  await ChatMessage.create({
    content,
    speaker: ChatMessage.getSpeaker({ actor }),
    flags: {
      [SYSTEM_ID]: {
        [CARD_PRESENTATION_FLAG]: { card: ABILITY_CARD_KIND, accentColor },
      },
    },
  });
}
