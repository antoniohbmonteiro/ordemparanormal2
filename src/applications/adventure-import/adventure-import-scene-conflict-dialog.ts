import type { SceneConflictDecision } from "../../features/adventure-import/import-adventure-scenes";
import type { PreparedAdventureScene } from "../../features/adventure-import/prepare-adventure-scenes";

export async function openAdventureImportSceneConflictDialog(scenes: readonly PreparedAdventureScene[]): Promise<SceneConflictDecision> {
  const content = await foundry.applications.handlebars.renderTemplate(
    "systems/ordemparanormal2/templates/applications/adventure-import-scene-conflict-dialog.hbs",
    { scenes: scenes.map(s => ({ name: s.displayName, summary: game.i18n.format("ORDEMPARANORMAL2.AdventureImport.SceneConflict.Categories", {
      walls: s.desired.walls.length, tiles: s.desired.tiles.length, tokens: s.desired.tokens.length, drawings: s.desired.drawings.length }) })) },
  );
  const result = await foundry.applications.api.DialogV2.wait({
    window: { title: "ORDEMPARANORMAL2.AdventureImport.SceneConflict.Title" },
    position: { width: 560 }, content, modal: true, rejectClose: false,
    buttons: [
      { action: "preserve", label: "ORDEMPARANORMAL2.AdventureImport.AgentConflict.Preserve", default: true, callback: () => "preserve" },
      { action: "restore", label: "ORDEMPARANORMAL2.AdventureImport.AgentConflict.Restore", callback: () => "restore" },
    ],
  });
  return result === "preserve" || result === "restore" ? result : null;
}
