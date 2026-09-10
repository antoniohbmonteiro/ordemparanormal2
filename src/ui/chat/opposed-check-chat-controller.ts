import {
  parseOpposedCheckState,
  type OpposedCheckSide,
  type OpposedCheckStateV1,
} from "../../application/checks/opposed-check-state";
import { canUserRollActor } from "../../adapters/foundry/actors/agent-check-permission";
import { resolveOpposedCheckParticipant } from "../../adapters/foundry/actors/resolve-opposed-check-participant";
import { OPPOSED_CHECK_STATE_FLAG, SYSTEM_ID } from "../../config/system-config";
import { rollOpposedCheckSide } from "../../features/checks/roll-opposed-check-side";

function isStillPending(message: ChatMessage, side: OpposedCheckSide): boolean {
  const state = parseOpposedCheckState(message.getFlag(SYSTEM_ID, OPPOSED_CHECK_STATE_FLAG));
  return state?.[side].result === undefined;
}

async function projectSideControl(
  message: ChatMessage,
  root: HTMLElement,
  state: OpposedCheckStateV1,
  side: OpposedCheckSide,
): Promise<void> {
  const container = root.querySelector<HTMLElement>(`[data-opposed-side-actions="${side}"]`);
  if (!container || state[side].result) return;
  const actor = await resolveOpposedCheckParticipant(state[side].participant);
  if (!actor || !canUserRollActor(actor, game.user)) return;
  const button = root.ownerDocument.createElement("button");
  button.type = "button";
  button.className = "op2-opposed-check-card__roll";
  button.dataset.action = "roll-opposed-check";
  button.dataset.side = side;
  const rollLabel = game.i18n.localize("ORDEMPARANORMAL2.OpposedCheckCard.Roll");
  button.textContent = rollLabel;
  button.addEventListener("click", async () => {
    let submitted = false;
    button.disabled = true;
    button.dataset.loading = "true";
    button.textContent = game.i18n.localize(
      "ORDEMPARANORMAL2.OpposedCheckCard.Rolling",
    );
    try {
      if (!message.id) throw new Error("Opposed Check message has no ID.");
      submitted = await rollOpposedCheckSide(message.id, side) === "submitted";
    } catch (error) {
      console.error(`${SYSTEM_ID} | Failed to roll Opposed Check side.`, error);
      ui.notifications.error(
        game.i18n.localize("ORDEMPARANORMAL2.OpposedCheckCard.Errors.Roll"),
      );
    } finally {
      delete button.dataset.loading;
      if (!submitted && isStillPending(message, side)) {
        button.disabled = false;
        button.textContent = rollLabel;
      }
    }
  });
  container.replaceChildren(button);
}

export async function activateOpposedCheckChatController(
  message: ChatMessage,
  root: HTMLElement,
  state: OpposedCheckStateV1,
): Promise<void> {
  const card = root.querySelector<HTMLElement>(".op2-opposed-check-card");
  if (!card) return;
  await Promise.all([
    projectSideControl(message, card, state, "left"),
    projectSideControl(message, card, state, "right"),
  ]);
}
