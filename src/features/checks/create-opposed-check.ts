import { buildAgentCheck } from "../../application/checks/build-agent-check";
import {
  areOpposedCheckParticipantReferencesEqual,
  type OpposedCheckDialogResult,
} from "../../application/checks/opposed-check-configuration";
import type { OpposedCheckSideStateV1, OpposedCheckStateV1 } from "../../application/checks/opposed-check-state";
import { resolveOpposedCheckParticipant } from "../../adapters/foundry/actors/resolve-opposed-check-participant";
import { readAgentCheckSource } from "../../adapters/foundry/actors/read-agent-check-source";
import { createOpposedCheckMessage } from "../../adapters/foundry/chat/create-opposed-check-message";
import { isCustomSkillKey } from "../../core/actors/custom-skills";
import { availableActorCustomSkills } from "../../adapters/foundry/actors/actor-custom-skills";

async function buildSide(
  configuration: OpposedCheckDialogResult["left"],
): Promise<OpposedCheckSideStateV1> {
  const actor = await resolveOpposedCheckParticipant(configuration.participant);
  if (!actor) throw new Error("Opposed Check participant is no longer available.");
  if (configuration.selection.kind === "skill" && isCustomSkillKey(configuration.selection.key)
    && !availableActorCustomSkills(actor).some(option => option.key === configuration.selection.key))
    throw new Error("A perícia selecionada está indisponível.");
  const check = buildAgentCheck(
    configuration.selection,
    readAgentCheckSource(actor),
    (key) => game.i18n.localize(key),
  );
  const img = actor.img?.trim();
  return {
    participant: configuration.participant,
    selection: configuration.selection,
    presentation: {
      name: actor.name.trim(),
      ...(img ? { img } : {}),
      requestedCheckLabel: check.check.name,
      requestedCheckContext: check.components.map(({ label }) => label).join(" + "),
    },
  };
}

export async function createOpposedCheck(result: OpposedCheckDialogResult): Promise<ChatMessage> {
  if (!game.user.isGM) throw new Error("Only a GM can create an Opposed Check.");
  if (areOpposedCheckParticipantReferencesEqual(result.left.participant, result.right.participant)) {
    throw new Error("Opposed Check participants must be different.");
  }
  const [left, right] = await Promise.all([buildSide(result.left), buildSide(result.right)]);
  const state: OpposedCheckStateV1 = { schemaVersion: 1, left, right };
  return createOpposedCheckMessage(state);
}
