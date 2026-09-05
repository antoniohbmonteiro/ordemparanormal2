import {
  CARD_PRESENTATION_FLAG,
  EQUIPMENT_CARD_KIND,
  EQUIPMENT_ITEM_TYPE,
  SYSTEM_ID,
} from "../../../config/system-config";
import { isEquipmentCategory } from "../../../core/equipment/equipment-category";
import { readEquipmentUses } from "../../../core/equipment/equipment-uses";
import {
  buildEquipmentCardViewModel,
  type EquipmentCardViewModel,
} from "../../../ui/chat/equipment-card-view-model";
import { readAgentAccentColor } from "../actors/read-agent-accent-color";
import { ensureChatCardPartialsLoaded } from "./ensure-chat-card-partials-loaded";

const EQUIPMENT_CARD_TEMPLATE =
  `systems/${SYSTEM_ID}/templates/chat/equipment-card.hbs`;

function readRawSystem(system: unknown) {
  if (!system || typeof system !== "object") {
    return { description: "", category: "general" as const, uses: null };
  }
  const raw = system as {
    readonly description?: unknown;
    readonly category?: unknown;
    readonly uses?: unknown;
  };
  return {
    description: typeof raw.description === "string" ? raw.description : "",
    category: isEquipmentCategory(raw.category) ? raw.category : "general",
    uses: readEquipmentUses(raw.uses),
  };
}

export async function buildEquipmentCardContext(
  equipment: foundry.documents.Item,
): Promise<EquipmentCardViewModel> {
  const { TextEditor } = foundry.applications.ux;
  const system = readRawSystem(equipment.system);
  const description = await TextEditor.implementation.enrichHTML(
    system.description,
    { relativeTo: equipment, secrets: equipment.isOwner },
  );

  return buildEquipmentCardViewModel({
    name: equipment.name,
    img: equipment.img ?? "",
    category: system.category,
    description,
    uses: system.uses,
  });
}

/**
 * Posts a plain chat card with an Equipment's name, category, description and
 * uses, spoken by the owning Agent. Presentation only: it never consumes uses
 * or mutates state.
 */
export async function publishEquipmentMessage(
  actor: foundry.documents.Actor,
  equipment: foundry.documents.Item,
): Promise<void> {
  if (equipment.type !== EQUIPMENT_ITEM_TYPE) return;

  const accentColor = readAgentAccentColor(actor);
  await ensureChatCardPartialsLoaded();
  const content = await foundry.applications.handlebars.renderTemplate(
    EQUIPMENT_CARD_TEMPLATE,
    await buildEquipmentCardContext(equipment),
  );

  await ChatMessage.create({
    content,
    speaker: ChatMessage.getSpeaker({ actor }),
    flags: {
      [SYSTEM_ID]: {
        [CARD_PRESENTATION_FLAG]: { card: EQUIPMENT_CARD_KIND, accentColor },
      },
    },
  });
}
