import type { PoiConflictDecision, PreparedAdventurePoi } from "../../features/adventure-import/import-adventure-pois";

export async function openAdventureImportPoiConflictDialog(pois: readonly PreparedAdventurePoi[]): Promise<PoiConflictDecision> {
  const content = await foundry.applications.handlebars.renderTemplate(
    "systems/ordemparanormal2/templates/applications/adventure-import-poi-conflict-dialog.hbs",
    { pois: pois.map(p => ({ name: p.preset.name, act: p.preset.act === "actOne" ? "Ato I" : "Ato II" })) },
  );
  const result = await foundry.applications.api.DialogV2.wait({
    window: { title: "ORDEMPARANORMAL2.AdventureImport.PoiConflict.Title" },
    position: { width: 560 }, content, modal: true, rejectClose: false,
    buttons: [
      { action: "preserve", label: "ORDEMPARANORMAL2.AdventureImport.AgentConflict.Preserve", default: true, callback: () => "preserve" },
      { action: "restore", label: "ORDEMPARANORMAL2.AdventureImport.AgentConflict.Restore", callback: () => "restore" },
    ],
  });
  return result === "preserve" || result === "restore" ? result : null;
}
