import type { InvestigationParticipant } from "../../adapters/foundry/points-of-interest/investigation-runtime";
import { requestInvestigationAction } from "../../adapters/foundry/points-of-interest/investigation-requests";
import { requestShareCandidates } from "../../adapters/foundry/points-of-interest/investigation-share";

const ROOT = "ORDEMPARANORMAL2.PointOfInterest.Investigation";

function option(value: string, label: string): string {
  const element = document.createElement("option");
  element.value = value;
  element.textContent = label;
  return element.outerHTML;
}

export async function openInvestigationControlAction(
  sceneId: string, runId: string, kind: "recap" | "share", participants: readonly InvestigationParticipant[],
): Promise<void> {
  if (!game.user?.isGM || !participants.length) return;
  const actorUuid = await foundry.applications.api.DialogV2.input<string | null>({
    classes: ["ordemparanormal2", "op2-investigation"], modal: true,
    content: `<label>${game.i18n.localize(`${ROOT}.Agent`)}<select name="actor">${participants.map(actor => option(actor.uuid, actor.name)).join("")}</select></label>`,
    ok: { action: "select", label: `${ROOT}.ChooseAgent`, default: true,
      callback: (_event, button) => {
        const field = button.form?.elements.namedItem("actor");
        return field instanceof HTMLSelectElement ? field.value : null;
      } },
    position: { width: 360 }, rejectClose: false,
    window: { title: game.i18n.localize(`${ROOT}.${kind === "recap" ? "Recap" : "Share"}`) },
  });
  if (!actorUuid || !participants.some(actor => actor.uuid === actorUuid)) return;
  if (kind === "recap") {
    const text = await foundry.applications.api.DialogV2.input<string | null>({
      classes: ["ordemparanormal2", "op2-investigation"], modal: true,
      content: `<label>${game.i18n.localize(`${ROOT}.RecapDescription`)}<textarea name="recap" maxlength="4000" required></textarea></label>`,
      ok: { action: "send", label: `${ROOT}.Recap`, default: true,
        callback: (_event, button) => {
          const field = button.form?.elements.namedItem("recap");
          return field instanceof HTMLTextAreaElement ? field.value.trim() : null;
        } },
      position: { width: 360 }, rejectClose: false,
      window: { title: game.i18n.localize(`${ROOT}.Recap`) },
    });
    if (!text) return;
    const result = await requestInvestigationAction({ kind, sceneId, runId, actorUuid, text });
    ui.notifications[result.ok ? "info" : "error"](game.i18n.localize(`${ROOT}.${result.ok ? "RequestSent" : "RequestFailed"}`));
    return;
  }
  const candidates = await requestShareCandidates(sceneId, runId, actorUuid);
  const receivers = participants.filter(actor => actor.uuid !== actorUuid);
  if (!candidates.length || !receivers.length) {
    ui.notifications.warn(game.i18n.localize(`${ROOT}.NoShareOptions`));
    return;
  }
  const choice = await foundry.applications.api.DialogV2.input<{ clueIndex: number; receiverActorUuid: string } | null>({
    classes: ["ordemparanormal2", "op2-investigation"], modal: true,
    content: `<label>${game.i18n.localize(`${ROOT}.ShareReceiver`)}<select name="receiver">${receivers.map(actor => option(actor.uuid, actor.name)).join("")}</select></label>`
      + `<label>${game.i18n.localize(`${ROOT}.ShareClue`)}<select name="clue">${candidates.map((clue, index) => option(String(index), clue.label)).join("")}</select></label>`,
    ok: { action: "send", label: `${ROOT}.Share`, default: true,
      callback: (_event, button) => {
        const receiver = button.form?.elements.namedItem("receiver");
        const clue = button.form?.elements.namedItem("clue");
        return receiver instanceof HTMLSelectElement && clue instanceof HTMLSelectElement
          ? { receiverActorUuid: receiver.value, clueIndex: Number(clue.value) } : null;
      } },
    position: { width: 360 }, rejectClose: false,
    window: { title: game.i18n.localize(`${ROOT}.Share`) },
  });
  const clue = choice && Number.isInteger(choice.clueIndex) ? candidates[choice.clueIndex] : null;
  if (!choice || !clue || !receivers.some(actor => actor.uuid === choice.receiverActorUuid)) return;
  const result = await requestInvestigationAction({ kind, sceneId, runId, actorUuid,
    receiverActorUuid: choice.receiverActorUuid, clue: clue.reference });
  ui.notifications[result.ok ? "info" : "error"](game.i18n.localize(`${ROOT}.${result.ok ? "RequestSent" : "RequestFailed"}`));
}
