import type { AgentConflictDecision } from "../../features/adventure-import/import-adventure-agents";
import type { PreparedAdventureAgent } from "../../features/adventure-import/prepare-adventure-agents";

export async function openAdventureImportAgentConflictDialog(agents: readonly PreparedAdventureAgent[]): Promise<AgentConflictDecision> {
  const content = await foundry.applications.handlebars.renderTemplate(
    "systems/ordemparanormal2/templates/applications/adventure-import-agent-conflict-dialog.hbs",
    { agents: agents.map(a => ({ name: a.preset.name, act: a.preset.act === "actOne" ? "Ato I" : "Ato II" })) },
  );
  const result = await foundry.applications.api.DialogV2.wait({
    window: { title: "ORDEMPARANORMAL2.AdventureImport.AgentConflict.Title" },
    position: { width: 560 }, content, modal: true, rejectClose: false,
    buttons: [
      { action: "preserve", label: "ORDEMPARANORMAL2.AdventureImport.AgentConflict.Preserve", default: true, callback: () => "preserve" },
      { action: "restore", label: "ORDEMPARANORMAL2.AdventureImport.AgentConflict.Restore", callback: () => "restore" },
    ],
  });
  return result === "preserve" || result === "restore" ? result : null;
}
