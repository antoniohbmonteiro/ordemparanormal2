import { createNarrativeClue, grantNarrativeClue, narrativeCluesForScene } from "../../adapters/foundry/points-of-interest/investigation-clues";
import { grantPendingShareClue, sceneInvestigationRuntime, type InvestigationShareClueChoice } from "../../adapters/foundry/points-of-interest/investigation-runtime";
import { refreshInvestigationShareCard } from "../../adapters/foundry/points-of-interest/refresh-investigation-share-card";
import { broadcastPoiInvalidation } from "../../adapters/foundry/points-of-interest/poi-runtime-queries";
import { openPoiAgentRevealDialog } from "./poi-agent-reveal-dialog";

const ROOT = "ORDEMPARANORMAL2.PointOfInterest.InvestigationControl";

async function selectNarrativeClueGrant(sceneId: string, runId: string): Promise<InvestigationShareClueChoice | null> {
  if (!game.user?.isGM || game.users.activeGM?.id !== game.user.id) return null;
  const scene = game.scenes.get(sceneId);
  if (!scene || sceneInvestigationRuntime(scene)?.runId !== runId) return null;
  const clues = narrativeCluesForScene(scene).filter(clue => clue.runId === runId);
  const options = clues.map(clue => {
    const option = document.createElement("option");
    option.value = clue.id;
    option.textContent = clue.text;
    return option.outerHTML;
  }).join("");
  const choice = await foundry.applications.api.DialogV2.input<{ clueId: string; text: string } | null>({
    classes: ["ordemparanormal2", "op2-investigation"], modal: true,
    content: `<label>${game.i18n.localize(`${ROOT}.SelectClue`)}<select name="existing"><option value="">${game.i18n.localize(`${ROOT}.NewClue`)}</option>${options}</select></label>`
      + `<label>${game.i18n.localize(`${ROOT}.ClueText`)}<textarea name="clue" maxlength="4000"></textarea></label>`,
    ok: { action: "save", label: `${ROOT}.SaveClue`, default: true,
      callback: (_event, button) => {
        const field = button.form?.elements.namedItem("clue");
        const existing = button.form?.elements.namedItem("existing");
        return field instanceof HTMLTextAreaElement && existing instanceof HTMLSelectElement
          ? { clueId: existing.value, text: field.value.trim() } : null;
      } },
    position: { width: 460 }, rejectClose: false,
    window: { title: game.i18n.localize(`${ROOT}.CreateClue`) },
  });
  if (!choice || (!choice.clueId && !choice.text) || (choice.clueId && !clues.some(clue => clue.id === choice.clueId))) return null;
  const recipients = await openPoiAgentRevealDialog(sceneId);
  if (!recipients?.length) return null;
  return choice.clueId ? { kind: "existing", clueId: choice.clueId, recipientActorUuids: recipients }
    : { kind: "new", text: choice.text, recipientActorUuids: recipients };
}

export async function openCreateInvestigationClueDialog(sceneId: string, runId: string): Promise<void> {
  const choice = await selectNarrativeClueGrant(sceneId, runId);
  const scene = game.scenes.get(sceneId);
  if (!choice || !scene) return;
  if (choice.kind === "existing") await grantNarrativeClue(scene, runId, choice.clueId, choice.recipientActorUuids);
  else await createNarrativeClue(scene, runId, choice.text, choice.recipientActorUuids);
  await broadcastPoiInvalidation();
}

/** Used by both the successful Share card and Investigation Control. */
export async function openPendingShareClueGrant(sceneId: string, runId: string): Promise<boolean> {
  if (!game.user?.isGM || game.users.activeGM?.id !== game.user.id) return false;
  const scene = game.scenes.get(sceneId);
  const runtime = scene ? sceneInvestigationRuntime(scene) : null;
  if (!runtime || runtime.runId !== runId || !runtime.shareCluePending) return false;
  const choice = runtime.shareClueGrant ? undefined : await selectNarrativeClueGrant(sceneId, runId);
  if (!choice && !runtime.shareClueGrant) return false;
  const granted = await grantPendingShareClue(sceneId, runId, choice ?? undefined);
  if (granted && runtime.shareSuccessMessageId) await refreshInvestigationShareCard(runtime.shareSuccessMessageId)
    .catch(error => console.error("ordemparanormal2 | Failed to refresh Share card", error));
  return granted;
}
