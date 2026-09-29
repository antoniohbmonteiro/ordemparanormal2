import { createNarrativeClue, grantNarrativeClue, narrativeCluesForScene } from "../../adapters/foundry/points-of-interest/investigation-clues";
import { broadcastPoiInvalidation } from "../../adapters/foundry/points-of-interest/poi-runtime-queries";
import { openPoiAgentRevealDialog } from "./poi-agent-reveal-dialog";

const ROOT = "ORDEMPARANORMAL2.PointOfInterest.InvestigationControl";

export async function openCreateInvestigationClueDialog(sceneId: string, runId: string): Promise<void> {
  if (!game.user?.isGM || game.users.activeGM?.id !== game.user.id) return;
  const scene = game.scenes.get(sceneId);
  if (!scene) return;
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
  if (!choice || (!choice.clueId && !choice.text) || (choice.clueId && !clues.some(clue => clue.id === choice.clueId))) return;
  const recipients = await openPoiAgentRevealDialog(sceneId);
  if (!recipients?.length) return;
  if (choice.clueId) await grantNarrativeClue(scene, runId, choice.clueId, recipients);
  else await createNarrativeClue(scene, runId, choice.text, recipients);
  await broadcastPoiInvalidation();
}
