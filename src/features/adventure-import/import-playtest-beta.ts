import { auditBetaLegacyAbilities, importBetaAgentAbilities, prepareBetaAbilitySources } from "../../adapters/foundry/playtest-beta-abilities";

import { BETA_MISSIONS, type BetaMissionId } from "../../config/adventure-definitions/playtest-beta";
import { canManageCustomSkills, readWorldCustomSkillCatalog, saveWorldCustomSkill } from "../../adapters/foundry/actors/custom-skill-catalog";
import { createAdventureFolderPort } from "../../adapters/foundry/adventure-folders";
import { prepareBetaFolders } from "./playtest-beta-folders";
import { materializeBetaAssets } from "../../adapters/foundry/playtest-beta-assets";
import { betaDocumentHasChanges, betaDocumentPort, findBetaDocument, reconcileBetaDocument,
  type BetaConflictDecision, type BetaDocument, type BetaTarget } from "../../adapters/foundry/playtest-beta-documents";
import { planBetaSkills } from "./playtest-beta-skills";
import { createBetaDocumentPlan, type BetaAssetLookup } from "./playtest-beta-content";
import type { PreparedBetaMission } from "./prepare-playtest-beta";

let running = false;

export interface BetaImportOptions {
  missions: readonly PreparedBetaMission[];
  maps: Readonly<Partial<Record<BetaMissionId, string>>>;
  progress(label: string): Promise<void>;
  conflict(name: string): Promise<BetaConflictDecision>;
}

function previewAsset(world: string): BetaAssetLookup {
  return (_mission, path) => "worlds/" + world + "/ordemparanormal2/preview." + path.split(".").at(-1);
}

export async function previewBetaImport(options: Pick<BetaImportOptions, "missions" | "maps">): Promise<readonly string[]> {
  const current = readWorldCustomSkillCatalog();
  if (!current) throw new Error("O catálogo de perícias personalizadas está inválido.");
  const skills = planBetaSkills(options.missions, current, canManageCustomSkills());
  const plan = createBetaDocumentPlan(options, skills, previewAsset(game.world.id));
  const records = await Promise.all(plan.preflight.map(async target =>
    await betaDocumentHasChanges(betaDocumentPort(target.type), target) ? target.name : null));
  return records.filter((name): name is string => name !== null);
}

export async function importPlaytestBeta(options: BetaImportOptions) {
  if (running) throw new Error("Já há uma importação Beta em andamento.");
  const world = game.world.id;
  const guard = () => {
    if (game.world.id !== world || !game.user.isGM || game.users.activeGM?.id !== game.user.id)
      throw new Error("A importação requer o mestre ativo deste mundo.");
  };
  guard();
  running = true;
  try {
    const current = readWorldCustomSkillCatalog();
    if (!current) throw new Error("O catálogo de perícias personalizadas está inválido.");
    const skills = planBetaSkills(options.missions, current, canManageCustomSkills());

    function save(target: BetaTarget, parent?: BetaDocument) {
      return reconcileBetaDocument(betaDocumentPort(target.type, parent), target, guard, options.conflict);
    }

    const catalog = createBetaDocumentPlan(options, skills, previewAsset(world));
    for (const target of catalog.preflight) {
      const port = betaDocumentPort(target.type);
      findBetaDocument(port, target);
      port.validate({ ...target.source, name: target.name });
    }
    const ensureFolders = prepareBetaFolders(catalog.routes, createAdventureFolderPort());
    const agents = options.missions.flatMap(mission => mission.agents);
    const legacyBefore = await auditBetaLegacyAbilities(agents);
    await options.progress("Preparando fontes reutilizáveis de habilidades…");
    const abilitySources = await prepareBetaAbilitySources(agents);
    guard();
    const assets = await materializeBetaAssets(options.missions, guard, options.progress);
    for (const definition of skills.create) {
      guard();
      if (!canManageCustomSkills()) break;
      const beforeSave = readWorldCustomSkillCatalog();
      if (!beforeSave) throw new Error("O catálogo de perícias personalizadas ficou inválido.");
      if (!planBetaSkills(options.missions, beforeSave, true).create.some(entry => entry.id === definition.id)) continue;
      try {
        await saveWorldCustomSkill(definition, 0);
      } catch (error) {
        const latest = readWorldCustomSkillCatalog();
        if (!latest || planBetaSkills(options.missions, latest, canManageCustomSkills()).create.some(entry => entry.id === definition.id))
          throw error;
      }
    }
    const confirmed = readWorldCustomSkillCatalog();
    if (!confirmed) throw new Error("Catálogo Beta não confirmado.");
    const plan = createBetaDocumentPlan(options, planBetaSkills(options.missions, confirmed, false), assets);
    guard();
    for (const [key, id] of await ensureFolders()) plan.folders.set(key, id);
    for (const type of ["JournalEntry", "Scene"] as const) {
      const root = await save({ type: "Folder", id: "folder:" + type, name: "Contos da Vigília",
        source: { type, color: "#7a2424" }, managed: {} });
      plan.folders.set(type + ":shared", root.id);
      for (const mission of BETA_MISSIONS.filter(id => options.missions.some(m => m.mission === id))) {
        const name = mission === "mission1" ? "Missão 1" : "Missão 2";
        const folder = await save({ type: "Folder", id: "folder:" + type + ":" + mission, name,
          source: { type, folder: root.id, color: "#4f2525" }, managed: {} });
        plan.folders.set(type + ":" + mission, folder.id);
      }
    }
    await options.progress("Criando documentos do Playtest Beta…");
    await plan.execute(save, guard, (agent, actor, saveItem) =>
      importBetaAgentAbilities(agent, actor, abilitySources, saveItem, guard));
    if (legacyBefore.length) {
      const legacyAfter = await auditBetaLegacyAbilities(agents, legacyBefore);
      console.info("ordemparanormal2 | Habilidades Beta antigas preservadas", { antes: legacyBefore, depois: legacyAfter });
      return { legacy: legacyAfter, folderWarnings: plan.folderWarnings };
    }
    return { legacy: [], folderWarnings: plan.folderWarnings };
  } finally { running = false; }
}
