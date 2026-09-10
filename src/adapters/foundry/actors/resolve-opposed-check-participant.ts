import type { OpposedCheckParticipantReference } from "../../../application/checks/opposed-check-configuration";
import { AGENT_ACTOR_TYPE } from "../../../config/system-config";

function isAgentActor(value: unknown): value is foundry.documents.Actor {
  return value instanceof Actor && value.type === AGENT_ACTOR_TYPE;
}

export async function resolveOpposedCheckParticipant(
  reference: OpposedCheckParticipantReference,
): Promise<foundry.documents.Actor | null> {
  const document = await fromUuid(reference.uuid);
  if (reference.kind === "actor") return isAgentActor(document) ? document : null;
  if (!(document instanceof foundry.documents.TokenDocument)) return null;
  return isAgentActor(document.actor) ? document.actor : null;
}
