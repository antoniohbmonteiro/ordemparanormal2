import type { CheckRequestStateV1 } from "../../application/checks/check-request-state";
import { canUserRollActor } from "../../adapters/foundry/actors/agent-check-permission";
import { resolveAgentCheckParticipant } from "../../adapters/foundry/actors/resolve-agent-check-participant";
import { readCheckRequestMessageLifecycle } from "../../adapters/foundry/chat/read-check-request-message";
import { SYSTEM_ID } from "../../config/system-config";
import { rollCheckRequest } from "../../features/checks/roll-check-request";

function isStillPending(message: ChatMessage): boolean {
  return readCheckRequestMessageLifecycle(message)?.state.status === "pending";
}

export async function activateCheckRequestChatController(
  message: ChatMessage,
  root: HTMLElement,
  state: CheckRequestStateV1 & { readonly status: "pending" },
): Promise<void> {
  const container = root.querySelector<HTMLElement>("[data-check-request-actions]");
  if (!container) return;
  const actor = await resolveAgentCheckParticipant(state.participant);
  if (!actor || !canUserRollActor(actor, game.user)) return;
  const button = root.ownerDocument.createElement("button");
  button.type = "button";
  button.dataset.action = "roll-check-request";
  const rollLabel = game.i18n.localize("ORDEMPARANORMAL2.CheckRequestCard.Roll");
  button.textContent = rollLabel;
  button.addEventListener("click", async () => {
    let submitted = false;
    button.disabled = true;
    button.dataset.loading = "true";
    button.textContent = game.i18n.localize("ORDEMPARANORMAL2.CheckRequestCard.Rolling");
    try {
      if (!message.id) throw new Error("Check Request message has no ID.");
      submitted = await rollCheckRequest(message.id) === "submitted";
    } catch (error) {
      console.error(`${SYSTEM_ID} | Failed to roll Check Request.`, error);
      ui.notifications.error(
        game.i18n.localize("ORDEMPARANORMAL2.CheckRequestCard.Errors.Roll"),
      );
    } finally {
      delete button.dataset.loading;
      if (!submitted && isStillPending(message)) {
        button.disabled = false;
        button.textContent = rollLabel;
      }
    }
  });
  container.replaceChildren(button);
}
