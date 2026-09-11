import { buildAgentCheck } from "../../application/checks/build-agent-check";
import type { CheckRequestStateV1 } from "../../application/checks/check-request-state";
import type { CheckRequestDialogResult } from "../../applications/checks/check-request-dialog";
import { readAgentAccentColor } from "../../adapters/foundry/actors/read-agent-accent-color";
import { readAgentCheckSource } from "../../adapters/foundry/actors/read-agent-check-source";
import { resolveAgentCheckParticipant } from "../../adapters/foundry/actors/resolve-agent-check-participant";
import { createCheckRequestMessage } from "../../adapters/foundry/chat/create-check-request-message";

export async function createCheckRequest(
  configuration: CheckRequestDialogResult,
): Promise<ChatMessage> {
  if (!game.user.isGM) throw new Error("Only a GM can create a Check Request.");
  if (configuration.selection.kind !== "skill") {
    throw new Error("A Check Request must select a Skill.");
  }
  if (
    configuration.difficulty !== undefined &&
    (!Number.isInteger(configuration.difficulty) || configuration.difficulty < 1)
  ) throw new Error("Check Request difficulty must be a positive integer.");

  const actor = await resolveAgentCheckParticipant(configuration.participant);
  if (!actor) throw new Error("Check Request participant is no longer available.");
  const check = buildAgentCheck(
    configuration.selection,
    readAgentCheckSource(actor),
    (key) => game.i18n.localize(key),
  );
  const img = actor.img?.trim();
  const state: CheckRequestStateV1 = {
    schemaVersion: 1,
    status: "pending",
    participant: configuration.participant,
    selection: configuration.selection,
    ...(configuration.difficulty !== undefined
      ? { difficulty: configuration.difficulty }
      : {}),
    presentation: {
      actorName: actor.name.trim(),
      ...(img ? { actorImg: img } : {}),
      requestedCheckLabel: check.check.name,
      requestedCheckContext: check.components.map(({ label }) => label).join(" + "),
    },
  };
  return createCheckRequestMessage(actor, state, readAgentAccentColor(actor));
}
