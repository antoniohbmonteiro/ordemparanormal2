import { SYSTEM_ID } from "../../config/system-config";

export function openPoiAgentRevealDialog(sceneId: string): Promise<readonly string[] | null> {
  return new Promise(resolve => {
    const scene = game.scenes.get(sceneId);
    const actors = (game.actors.contents as foundry.documents.Actor[]).filter(actor => actor.type === "agent");
    const sceneIds = new Set(scene ? [...scene.tokens].map(token => token.actorId).filter(Boolean) : []);
    const content = document.createElement("div");
    content.className = "op2-poi-agent-dialog";
    const all = document.createElement("button");
    all.type = "button";
    all.textContent = game.i18n.localize("ORDEMPARANORMAL2.PointOfInterest.Investigation.AllSceneAgents");
    content.append(all);
    const boxes = actors.map(actor => {
      const row = document.createElement("label");
      const box = document.createElement("input");
      box.type = "checkbox"; box.value = actor.uuid;
      row.append(box, document.createTextNode(actor.name));
      content.append(row);
      return { box, actor };
    });
    all.addEventListener("click", () => { for (const { box, actor } of boxes) box.checked = !!actor.id && sceneIds.has(actor.id); });
    const mount = document.createElement("div");
    mount.className = "op2-poi-agent-dialog-mount";
    const dialog = new foundry.applications.api.DialogV2({
      window: { title: game.i18n.localize("ORDEMPARANORMAL2.PointOfInterest.Investigation.SelectRecipients") },
      position: { width: 440 }, content: mount,
      buttons: [
        { action: "confirm", label: game.i18n.localize("ORDEMPARANORMAL2.PointOfInterest.Investigation.Reveal"),
          default: true, callback: () => resolve(boxes.filter(({ box }) => box.checked).map(({ actor }) => actor.uuid)) },
        { action: "cancel", label: game.i18n.localize("ORDEMPARANORMAL2.PointOfInterest.Picker.Cancel") },
      ],
    });
    dialog.addEventListener("render", () => {
      (dialog.window as typeof dialog.window & { content: HTMLElement }).content
        .querySelector(".op2-poi-agent-dialog-mount")?.replaceWith(content);
    });
    dialog.addEventListener("close", () => resolve(null), { once: true });
    void dialog.render({ force: true }).catch(error => {
      console.error(`${SYSTEM_ID} | Agent reveal dialog failed`, error);
      resolve(null);
    });
  });
}
