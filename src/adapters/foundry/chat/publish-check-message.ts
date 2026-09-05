import {
  CHECK_PRESENTATION_FLAG,
  SYSTEM_ID,
} from "../../../config/system-config";
import { readAgentAccentColor } from "../actors/read-agent-accent-color";
import { createCheckSnapshot } from "../../../application/checks/check-snapshot";
import type { CheckDifficultyResolution } from "../../../core/checks/check";
import { buildCheckCardViewModel } from "../../../ui/chat/check-card-view-model";
import type { FoundryCheckExecution } from "../dice/execute-foundry-check";
import { ensureChatCardPartialsLoaded } from "./ensure-chat-card-partials-loaded";

const CHECK_CARD_TEMPLATE =
  "systems/ordemparanormal2/templates/chat/check-card.hbs";

export function isRegisteredMessageMode(value: unknown): value is string {
  return (
    typeof value === "string" &&
    Object.hasOwn(CONFIG.ChatMessage.modes, value)
  );
}

export function getCurrentMessageMode(): string {
  const messageMode = game.settings.get("core", "messageMode");

  if (!isRegisteredMessageMode(messageMode)) {
    throw new Error(`Unregistered Foundry chat message mode: ${String(messageMode)}`);
  }

  return messageMode;
}

export async function sendRollToMessage(
  roll: FoundryRegistryAwareRoll,
  messageData: object,
): Promise<unknown> {
  const messageMode = getCurrentMessageMode();
  return roll.toMessage(messageData, { messageMode });
}

export async function publishCheckMessage(
  actor: foundry.documents.Actor,
  execution: FoundryCheckExecution,
  difficultyResolution?: CheckDifficultyResolution,
): Promise<void> {
  const accentColor = readAgentAccentColor(actor);
  const snapshot = createCheckSnapshot(
    execution.result,
    difficultyResolution,
  );
  await ensureChatCardPartialsLoaded();
  const content = await foundry.applications.handlebars.renderTemplate(
    CHECK_CARD_TEMPLATE,
    buildCheckCardViewModel(snapshot),
  );

  await sendRollToMessage(execution.roll as FoundryRegistryAwareRoll, {
    content,
    speaker: ChatMessage.getSpeaker({ actor }),
    flags: {
      [SYSTEM_ID]: {
        check: snapshot,
        [CHECK_PRESENTATION_FLAG]: { accentColor },
      },
    },
  });
}
