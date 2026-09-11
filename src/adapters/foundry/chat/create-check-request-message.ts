import type { CheckRequestStateV1 } from "../../../application/checks/check-request-state";
import {
  CHECK_PRESENTATION_FLAG,
  CHECK_REQUEST_STATE_FLAG,
  SYSTEM_ID,
} from "../../../config/system-config";
import type { AccentColor } from "../../../core/actors/agent-accent-color";
import { ensureSharedPartialsLoaded } from "../templates/ensure-shared-partials-loaded";

const TEMPLATE = `systems/${SYSTEM_ID}/templates/chat/check-request-card.hbs`;

export async function renderPendingCheckRequestContent(
  state: CheckRequestStateV1,
): Promise<string> {
  if (state.status !== "pending") {
    throw new Error("Only a pending Check Request can use the pending card.");
  }
  await ensureSharedPartialsLoaded();
  return foundry.applications.handlebars.renderTemplate(TEMPLATE, {
    title: state.presentation.requestedCheckLabel,
    subtitle: state.presentation.actorName,
    context: state.presentation.requestedCheckContext,
    ...(state.difficulty !== undefined ? { difficulty: state.difficulty } : {}),
  });
}

export async function createCheckRequestMessage(
  actor: foundry.documents.Actor,
  state: CheckRequestStateV1,
  accentColor: AccentColor,
): Promise<ChatMessage> {
  const content = await renderPendingCheckRequestContent(state);
  const message = await ChatMessage.create({
    content,
    speaker: ChatMessage.getSpeaker({ actor }),
    flags: {
      [SYSTEM_ID]: {
        [CHECK_REQUEST_STATE_FLAG]: state,
        [CHECK_PRESENTATION_FLAG]: { accentColor },
      },
    },
  });
  if (!message) throw new Error("Foundry did not create the Check Request message.");
  return message;
}
