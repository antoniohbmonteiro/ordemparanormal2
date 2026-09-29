import { dispatchInvestigationDecision, type InvestigationRequestState } from "../../adapters/foundry/points-of-interest/investigation-requests";
import { SYSTEM_ID } from "../../config/system-config";

const ROOT = "ORDEMPARANORMAL2.PointOfInterest.InvestigationControl";

export function activateInvestigationRequestChatController(
  message: ChatMessage, root: HTMLElement, state: InvestigationRequestState,
): void {
  if (!game.user?.isGM || state.kind !== "recap" || state.status !== "pending" || !message.id) return;
  const container = root.querySelector<HTMLElement>("[data-investigation-request-actions]");
  if (!container) return;
  for (const [approved, label] of [[true, "Approve"], [false, "Decline"]] as const) {
    const button = root.ownerDocument.createElement("button");
    button.type = "button";
    button.textContent = game.i18n.localize(`${ROOT}.${label}`);
    button.addEventListener("click", async () => {
      button.disabled = true;
      try {
        if (!await dispatchInvestigationDecision(message.id!, approved))
          ui.notifications.error(game.i18n.localize(`${ROOT}.Failed`));
      } catch (error) {
        console.error(`${SYSTEM_ID} | Investigation request decision failed`, error);
        ui.notifications.error(game.i18n.localize(`${ROOT}.Failed`));
        button.disabled = false;
      }
    });
    container.append(button);
  }
}
