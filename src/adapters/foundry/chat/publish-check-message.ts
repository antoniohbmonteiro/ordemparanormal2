import {
  CHECK_PRESENTATION_FLAG,
  SYSTEM_ID,
} from "../../../config/system-config";
import { readAgentAccentColor } from "../actors/read-agent-accent-color";
import { createCheckSnapshot } from "../../../application/checks/check-snapshot";
import type { CheckDifficultyResolution } from "../../../core/checks/check";
import type { FoundryCheckExecution } from "../dice/execute-foundry-check";
import { renderCheckCardContent } from "./render-check-card-content";
import type { AppliedCheckAbilityUse } from "../../../application/checks/check-ability-use-state";

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
  mode?: string,
): Promise<unknown> {
  const messageMode = mode ?? getCurrentMessageMode();
  if (!isRegisteredMessageMode(messageMode)) throw new Error(`Unregistered Foundry chat message mode: ${messageMode}`);
  return roll.toMessage(messageData, { messageMode });
}

export async function publishCheckMessage(
  actor: foundry.documents.Actor,
  execution: FoundryCheckExecution,
  difficultyResolution?: CheckDifficultyResolution,
  appliedAbilityUses: readonly AppliedCheckAbilityUse[] = [],
  messageMode?: string,
): Promise<unknown> {
  const accentColor = readAgentAccentColor(actor);
  const snapshot = createCheckSnapshot(
    execution.result,
    difficultyResolution,
    appliedAbilityUses,
  );
  const content = await renderCheckCardContent(snapshot);

  return sendRollToMessage(execution.roll as FoundryRegistryAwareRoll, {
    content,
    speaker: ChatMessage.getSpeaker({ actor }),
    flags: {
      [SYSTEM_ID]: {
        check: snapshot,
        [CHECK_PRESENTATION_FLAG]: { accentColor },
      },
    },
  }, messageMode);
}
