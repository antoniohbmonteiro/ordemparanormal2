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
import { ensureSharedPartialsLoaded } from "../templates/ensure-shared-partials-loaded";
import type { EquipmentUseData } from "../../../core/equipment/equipment-use";

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
  use?: EquipmentUseData | null,
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
    description: use ? `${description}<p><strong>${foundry.utils.escapeHTML(use.name)}</strong></p>${await TextEditor.implementation.enrichHTML(
      use.description, { relativeTo: equipment, secrets: false })}` : description,
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
  use?: EquipmentUseData | null,
  operationKey?: string,
): Promise<void> {
  if (equipment.type !== EQUIPMENT_ITEM_TYPE) return;
  const messages = typeof game === "undefined" ? undefined
    : (game as typeof game & { messages?: { contents: ChatMessage[] } }).messages;
  if (operationKey && messages?.contents.some(message => message.getFlag(SYSTEM_ID, "equipmentUseOperation") === operationKey)) return;

  const accentColor = readAgentAccentColor(actor);
  await ensureSharedPartialsLoaded();
  const content = await foundry.applications.handlebars.renderTemplate(
    EQUIPMENT_CARD_TEMPLATE,
    await buildEquipmentCardContext(equipment, use),
  );

  const message = await ChatMessage.create({
    content,
    speaker: ChatMessage.getSpeaker({ actor }),
    flags: {
      [SYSTEM_ID]: {
        ...(operationKey ? { equipmentUseOperation: operationKey } : {}),
        [CARD_PRESENTATION_FLAG]: { card: EQUIPMENT_CARD_KIND, accentColor },
      },
    },
  });
  if (!message) throw new Error("Equipment chat message was not created.");
}
