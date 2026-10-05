import { dispatchInvestigationDecision, type InvestigationRequestState } from "../../adapters/foundry/points-of-interest/investigation-requests";
import { SYSTEM_ID } from "../../config/system-config";
import { openPendingShareClueGrant } from "../../applications/points-of-interest/investigation-clue-dialog";

const ROOT = "ORDEMPARANORMAL2.PointOfInterest.InvestigationControl";

export function activateInvestigationRequestChatController(
  message: ChatMessage, root: HTMLElement, state: InvestigationRequestState,
): void {
  if (!game.user?.isGM || state.kind !== "recap" || state.status !== "pending" || !message.id) return;
  const container = root.querySelector<HTMLElement>("[data-investigation-request-actions]");
  if (!container) return;
  for (const [approved, label] of [[false, "Decline"], [true, "Approve"]] as const) {
    const button = root.ownerDocument.createElement("button");
    button.type = "button";
    button.className = `op2-investigation-request-card__button${approved ? " is-approve" : ""}`;
    button.textContent = game.i18n.localize(`${ROOT}.${label}`);
    button.addEventListener("click", async () => {
      const buttons = container.querySelectorAll<HTMLButtonElement>("button");
      buttons.forEach(action => { action.disabled = true; });
      try {
        if (!await dispatchInvestigationDecision(message.id!, approved)) {
          ui.notifications.error(game.i18n.localize(`${ROOT}.Failed`));
          buttons.forEach(action => { action.disabled = false; });
        }
      } catch (error) {
        console.error(`${SYSTEM_ID} | Investigation request decision failed`, error);
        ui.notifications.error(game.i18n.localize(`${ROOT}.Failed`));
        buttons.forEach(action => { action.disabled = false; });
      }
    });
    container.append(button);
  }
}

export function activateInvestigationShareGrantController(root: HTMLElement, state: InvestigationRequestState): void {
  if (state.kind !== "share" || !game.user?.isGM || game.users.activeGM?.id !== game.user.id) return;
  const button = root.querySelector<HTMLButtonElement>("[data-investigation-share-grant]");
  if (!button) return;
  button.addEventListener("click", async () => {
    button.disabled = true;
    try {
      if (!await openPendingShareClueGrant(state.sceneId, state.runId)) button.disabled = false;
    } catch (error) {
      console.error(`${SYSTEM_ID} | Failed to grant Share clue`, error);
      ui.notifications.error(game.i18n.localize(`${ROOT}.Failed`));
      button.disabled = false;
    }
  });
}
