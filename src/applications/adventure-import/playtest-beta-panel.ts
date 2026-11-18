
import { BETA_MISSION_DATA, BETA_MISSIONS, type BetaMissionId } from "../../config/adventure-definitions/playtest-beta";
import { canManageCustomSkills, readWorldCustomSkillCatalog } from "../../adapters/foundry/actors/custom-skill-catalog";
import type { BetaConflictDecision } from "../../adapters/foundry/playtest-beta-documents";
import { importPlaytestBeta, previewBetaImport } from "../../features/adventure-import/import-playtest-beta";
import { preparePlaytestBeta, type PreparedBetaMission } from "../../features/adventure-import/prepare-playtest-beta";
import { planBetaSkills } from "../../features/adventure-import/playtest-beta-skills";

type BetaSlot = "beta-pdf" | BetaMissionId;
const localize = (key: string) => game.i18n.localize("ORDEMPARANORMAL2.AdventureImport." + key);

export class PlaytestBetaPanel {
  readonly files: Partial<Record<BetaSlot, File>> = {};
  readonly selected = new Set<BetaMissionId>();
  readonly maps: Partial<Record<BetaMissionId, string>> = {};
  analysis: Awaited<ReturnType<typeof preparePlaytestBeta>> | null = null;

  private get selectedMissions(): readonly PreparedBetaMission[] {
    return this.analysis?.detected.filter(mission => this.selected.has(mission.mission)) ?? [];
  }
  busy = false;
  status = "";
  error = "";
  conflicts: readonly string[] = [];

  attach(html: HTMLElement, render: () => Promise<unknown>) {
    html.addEventListener("change", event => {
      const input = event.target;
      if (this.busy || !(input instanceof HTMLElement)) return;
      const slot = input.dataset.betaFile;
      const map = input.dataset.betaMap;
      if (input instanceof HTMLInputElement && (slot === "beta-pdf" || slot === "mission1" || slot === "mission2")) {
        const file = input.files?.[0];
        if (!file) return;
        this.files[slot] = file;
        this.invalidate();
      } else if (input instanceof HTMLSelectElement && (map === "mission1" || map === "mission2")) {
        this.maps[map] = input.value;
      } else return;
      void render();
    });
  }

  private invalidate() {
    this.analysis = null;
    this.selected.clear();
    this.error = "";
    this.status = "";
    this.conflicts = [];
  }

  context() {
    const catalog = readWorldCustomSkillCatalog();
    const canManage = canManageCustomSkills();
    const selected = this.selectedMissions;
    const skills = selected.length && catalog ? planBetaSkills(selected, catalog, canManage) : null;
    return {
      busy: this.busy, status: this.status, error: this.error, conflicts: this.conflicts,
      canAnalyze: !this.busy && !!this.files["beta-pdf"],
      hasAnalysis: this.analysis !== null,
      canImport: !this.busy && !!catalog && this.selectedMissions.length > 0 && game.users.activeGM?.id === game.user.id,
      canManage: !this.busy && canManage,
      skills: skills && {
        canonical: skills.canonical.join(", "),
        reused: skills.reused.join(", "),
        created: skills.create.map(definition => definition.name).join(", "),
        conflicts: skills.conflicts,
        pending: skills.pending.map(entry => ({ ...entry, printed: (entry.kind === "die" ? "d" : "DT ") + entry.value })),
      },
      pdfName: this.files["beta-pdf"]?.name,
      extrasFiles: BETA_MISSIONS.map(slot => ({
        slot,
        labelKey: slot === "mission1" ? "ORDEMPARANORMAL2.AdventureImport.MissionOne" : "ORDEMPARANORMAL2.AdventureImport.MissionTwo",
        name: this.files[slot]?.name,
      })),
      missions: this.analysis ? BETA_MISSIONS.map(id => {
        const definition = BETA_MISSION_DATA[id];
        const analysis = this.analysis?.detected.find(mission => mission.mission === id);
        const selected = this.selected.has(id);
        const issue = this.analysis?.issues[id];
        const countEntries = (folder: string) => Object.keys(definition.entries).filter(path => path.startsWith(folder + "/")).length;
        return { id, name: definition.name, selected, ready: !!analysis, issue,
          status: analysis ? localize("Analysis.Availability.Ready")
            : localize(issue ? "BetaDetection.ZipInvalid" : "BetaDetection.ZipMissing"),
          selectionLabel: localize(selected ? "BetaDetection.DeselectMission" : "BetaDetection.SelectMission"),
          content: analysis ? [
            { icon: "fa-solid fa-users", label: localize("Analysis.Content.Agents"), count: analysis.agents.length },
            { icon: "fa-solid fa-paw", label: localize("BetaDetection.Threats"), count: analysis.threats.length },
            { icon: "fa-solid fa-book-open", label: localize("Analysis.Content.Handouts"), count: countEntries("Handouts") },
            { icon: "fa-solid fa-magnifying-glass", label: localize("Analysis.Content.PointsOfInterest"), count: analysis.pois.length },
            { icon: "fa-solid fa-map", label: localize("Analysis.Content.Scenes"), count: 1 },
          ] : [],
          maps: Object.keys(definition.entries).filter(path => path.startsWith("Mapas/")).map(path => {
            const value = path.slice("Mapas/".length);
            return { value, selected: value === (this.maps[id] ?? definition.defaultMap) };
          }),
        };
      }) : [],
    };
  }

  async toggleMission(mission: string | undefined, render: () => Promise<unknown>) {
    const detected = this.analysis?.detected.find(entry => entry.mission === mission);
    if (this.busy || !game.user.isGM || !detected) return;
    if (this.selected.has(detected.mission)) this.selected.delete(detected.mission);
    else this.selected.add(detected.mission);
    this.busy = true;
    try { await this.refreshPreview(); }
    finally { this.busy = false; await render(); }
  }

  private async refreshPreview() {
    this.conflicts = [];
    this.error = "";
    if (!this.selectedMissions.length) return;
    try {
      this.conflicts = await previewBetaImport({ missions: this.selectedMissions, maps: this.maps });
    } catch (error) {
      this.error = error instanceof Error ? error.message : "Falha ao revisar o mundo.";
    }
  }

  async run(action: "analyze" | "import", render: () => Promise<unknown>, conflict: (name: string) => Promise<BetaConflictDecision>) {
    if (this.busy || !game.user.isGM) return;
    if (action === "analyze" ? !this.context().canAnalyze : !this.context().canImport) return;
    this.busy = true;
    this.error = "";
    this.status = action === "analyze" ? "Analisando PDF, arquivos e fichas…" : "Validando a importação…";
    try {
      await render();
      if (action === "analyze") {
        const extras = { mission1: this.files.mission1, mission2: this.files.mission2 };
        this.analysis = await preparePlaytestBeta(this.files["beta-pdf"]!, extras);
        this.selected.clear();
        for (const mission of this.analysis.detected) this.selected.add(mission.mission);
        this.status = "";
        await this.refreshPreview();
      } else {
        const { legacy, folderWarnings } = await importPlaytestBeta({ missions: this.selectedMissions, maps: this.maps, conflict,
          progress: async label => { this.status = label; await render(); } });
        this.status = legacy.length
          ? "Importação Beta concluída. " + legacy.length + " fontes antigas preservadas para revisão."
          : "Importação Beta concluída.";
        if (folderWarnings.length) ui.notifications.warn("Localização preservada para revisão: " + folderWarnings.join(" · "));
      }
    } catch (error) {
      if (action === "analyze") this.invalidate();
      this.status = "";
      this.error = error instanceof Error ? error.message : "Falha ao processar o Playtest Beta.";
      console.error("ordemparanormal2 | Playtest Beta import", error);
    } finally { this.busy = false; await render(); }
  }
}
