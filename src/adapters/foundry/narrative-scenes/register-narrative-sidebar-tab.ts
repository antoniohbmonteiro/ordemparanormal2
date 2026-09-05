import { NarrativeSidebarTab } from "../../../applications/narrative-scenes/narrative-sidebar-tab";

const NARRATIVE_TAB_NAME = "narrative";

/**
 * Foundry v14 has no formal public registrar for custom sidebar tabs. Keep this
 * compatibility-sensitive integration isolated here so it is easy to review
 * when upgrading Foundry.
 */
export function registerNarrativeSidebarTab(): void {
  const Sidebar = foundry.applications.sidebar.Sidebar;

  CONFIG.ui.narrative = NarrativeSidebarTab;

  const narrativeDescriptor = {
    tooltip: "ORDEMPARANORMAL2.NarrativeScene.Sidebar.Tooltip",
    icon: "fa-solid fa-masks-theater",
    gmOnly: true,
  };
  const tabs = Object.entries(Sidebar.TABS).filter(
    ([name]) => name !== NARRATIVE_TAB_NAME,
  );
  const settingsIndex = tabs.findIndex(([name]) => name === "settings");

  if (settingsIndex < 0) tabs.push([NARRATIVE_TAB_NAME, narrativeDescriptor]);
  else tabs.splice(settingsIndex, 0, [NARRATIVE_TAB_NAME, narrativeDescriptor]);

  Sidebar.TABS = Object.fromEntries(tabs);
}
