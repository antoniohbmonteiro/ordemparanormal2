import { SKILL_DEFINITIONS } from "../../config/skills";
import type { PlaytestAlphaAgentPreset } from "../../config/adventure-agent-presets/playtest-alpha";
import { validateAdventureAgentData, adventureDataRecord as record } from "../../core/adventure-import/adventure-agent-data";
import { validateAdventureAgentReferences, type AdventureDefinition } from "../../core/adventure-import/adventure-definition";
import type { AdventureAct } from "../../core/adventure-import/recognize-zip-source";
import type { PdfSourceAnalysis } from "../../core/adventure-import/recognize-pdf-source";
import { resolveAdventureAsset, type AdventureAssetResolutionSource } from "./resolve-adventure-asset";
import type { AdventureFolderPlacementFlag } from "./adventure-folders";
import { abilityGrant, hasAgentDivergence, importFlag, itemSourceUuid, managedItems, relevantAgentState,
  type AgentActorSource, type AgentImportFlag } from "../../core/adventure-import/adventure-agent-reconciliation";

export interface AgentPortableItem {
  readonly uuid: string; readonly type: "profile" | "occupation" | "ability";
  readonly name: string; readonly img: string; readonly system: Record<string, unknown>;
  readonly effects?: readonly Record<string, unknown>[];
}
export interface PreparedAgentItem extends AgentPortableItem { readonly id: string; readonly existing: boolean; readonly grant: boolean }
export interface PreparedAdventureAgent {
  readonly preset: PlaytestAlphaAgentPreset; readonly flag: AgentImportFlag;
  readonly actorId: string | null; readonly previousState: string | null; readonly divergent: boolean;
  readonly img: string; readonly token: string; readonly items: readonly PreparedAgentItem[];
  readonly removeIds: readonly string[]; readonly profileId: string;
}
export interface AdventureAgentActorPort {
  isAuthorized(): boolean;
  newId(): string;
  listActors(): readonly AgentActorSource[];
  resolveCanonical(uuid: string, type: AgentPortableItem["type"]): Promise<AgentPortableItem>;
  validatePrepared(agent: PreparedAdventureAgent): void;
  prepareProfileAbilities(actorId: string | null, profileId: string, profile: AgentPortableItem, abilities: readonly AgentPortableItem[]): readonly AgentPortableItem[];
  createActor(agent: PreparedAdventureAgent, folder: string, folderPlacement: AdventureFolderPlacementFlag): Promise<string>;
  updateFolderPlacement(id: string, folder: string | null, flag: AdventureFolderPlacementFlag): Promise<void>;
  updateActor(id: string, agent: PreparedAdventureAgent): Promise<void>;
  createItems(id: string, items: readonly PreparedAgentItem[], agent: PreparedAdventureAgent): Promise<void>;
  updateItems(id: string, items: readonly PreparedAgentItem[], agent: PreparedAdventureAgent): Promise<void>;
  deleteItems(id: string, ids: readonly string[]): Promise<void>;
  completeActor(id: string, flag: AgentImportFlag): Promise<void>;
}
export interface PrepareAdventureAgentsInput {
  readonly definition: AdventureDefinition; readonly presets: readonly PlaytestAlphaAgentPreset[]; readonly revision: number;
  readonly acts: readonly AdventureAct[]; readonly pdf: PdfSourceAnalysis; readonly assetSource: AdventureAssetResolutionSource;
  readonly actors: AdventureAgentActorPort;
}
export function usableAdventurePdf(pdf: PdfSourceAnalysis | null): boolean {
  return pdf?.status === "recognized" && !pdf.passwordRequired && pdf.facts.parseAttempt.status === "success"
    && (pdf.edition === "playtest-alpha-v1.0" || pdf.edition === "playtest-alpha-v1.1");
}
export function readAgentImportFlag(actor: AgentActorSource, adventureId: string): AgentImportFlag | null {
  const flag = importFlag(actor);
  const raw = record(actor.flags?.ordemparanormal2)?.adventureImport;
  if (raw !== undefined && !flag) throw new Error("Marcação de importação incompatível.");
  if (!flag) return null;
  if (flag.importer !== "actor") throw new Error("Marcação de Actor incompatível.");
  if (flag.adventureId !== adventureId) return null;
  if (actor.type !== "agent" || flag.version !== 1 || typeof flag.documentId !== "string" || flag.presetId !== flag.documentId
    || !Number.isInteger(flag.presetRevision) || (flag.presetRevision as number) < 1
    || (flag.act !== "actOne" && flag.act !== "actTwo") || !flag.documentId.startsWith(`${flag.act}.`)
    || !["playtest-alpha-v1.0", "playtest-alpha-v1.1"].includes(String(flag.edition))
    || typeof flag.portraitAssetId !== "string" || typeof flag.tokenAssetId !== "string"
    || (flag.state !== "incomplete" && flag.state !== "complete")) throw new Error("Identidade de Actor incompatível.");
  if (flag.baseline !== undefined) {
    const b = record(flag.baseline);
    if (!b || typeof b.digest !== "string" || !Array.isArray(b.items) || !Array.isArray(b.manualUuids)
      || !b.manualUuids.every(v => typeof v === "string") || !b.items.every(v => {
        const i = record(v); return i && typeof i.id === "string" && typeof i.uuid === "string" && typeof i.type === "string" && typeof i.digest === "string";
      }) || new Set(b.items.map(v => record(v)?.id)).size !== b.items.length) throw new Error("Baseline incompatível.");
  } else if (flag.state === "complete") throw new Error("Baseline concluído ausente.");
  return flag as unknown as AgentImportFlag;
}
function checkItemStructure(actor: AgentActorSource, flag: AgentImportFlag): void {
  for (const type of ["profile", "occupation"]) if (actor.items.filter(i => i.type === type).length > 1) throw new Error(`Múltiplos Items ${type}.`);
  if (new Set(actor.items.map(i => i._id)).size !== actor.items.length) throw new Error("IDs embedded duplicados.");
  for (const item of actor.items) {
    const raw = record(item.flags?.ordemparanormal2);
    const f = importFlag(item), grant = abilityGrant(item);
    if (raw?.adventureImport !== undefined && (!f || f.importer !== "actorItem" || f.version !== 1 || f.adventureId !== flag.adventureId || f.documentId !== flag.documentId
      || typeof f.uuid !== "string" || !["profile", "occupation", "ability"].includes(item.type))) throw new Error("Provenance de Item incompatível.");
    if (raw?.profileGrant !== undefined && (!grant || item.type !== "ability" || f)) throw new Error("Provenance de grant incompatível.");
    if (f && item.type === "ability" && itemSourceUuid(item) !== f.uuid) throw new Error("Origem de Ability incompatível.");
  }
  const origins = managedItems(actor, flag).map(i => `${i.type}:${importFlag(i)?.uuid ?? itemSourceUuid(i)}`);
  for (const item of managedItems(actor, flag)) {
    const uuid = importFlag(item)?.uuid ?? itemSourceUuid(item);
    const pack = item.type === "ability" ? "abilities" : `${item.type}s`;
    if (typeof uuid !== "string" || !uuid.startsWith(`Compendium.ordemparanormal2.${pack}.Item.`) || !/^Compendium\.ordemparanormal2\.[a-z]+\.Item\.[A-Za-z0-9]+$/.test(uuid)) throw new Error("Origem canônica gerenciada incompatível.");
  }
  if (new Set(origins).size !== origins.length) throw new Error("Origens gerenciadas duplicadas.");
}
export async function prepareAdventureAgents(input: PrepareAdventureAgentsInput): Promise<readonly PreparedAdventureAgent[]> {
  const { definition, presets, acts, actors, pdf } = input;
  if (!actors.isAuthorized()) throw new Error("Somente o GM ativo pode importar agentes.");
  if (!usableAdventurePdf(pdf)) throw new Error("É necessário reconhecer e ler o PDF com sucesso.");
  if (!acts.length || new Set(acts).size !== acts.length || acts.some(a => a !== "actOne" && a !== "actTwo")) throw new Error("Escopo de atos inválido.");
  if (!Number.isInteger(input.revision) || input.revision < 1) throw new Error("Revisão de presets inválida.");
  for (const preset of presets) validateAdventureAgentData(preset, SKILL_DEFINITIONS);
  const issues = validateAdventureAgentReferences(definition, presets);
  if (issues.length) throw new Error(issues.join("; "));
  const selected = definition.actors.map(r => presets.find(p => p.id === r.presetId)!).filter(p => acts.includes(p.act));
  const existing = actors.listActors();
  const byId = new Map<string, { actor: AgentActorSource; flag: AgentImportFlag }>();
  for (const actor of existing) {
    const raw = importFlag(actor);
    if (raw?.adventureId === definition.id && raw.importer === "actor" && typeof raw.documentId === "string" && !selected.some(p => p.id === raw.documentId)) continue;
    const flag = readAgentImportFlag(actor, definition.id);
    if (!flag) continue;
    if (byId.has(flag.documentId)) throw new Error("Identidade de Actor duplicada.");
    checkItemStructure(actor, flag);
    byId.set(flag.documentId, { actor, flag });
  }
  const cache = new Map<string, Promise<AgentPortableItem>>();
  function resolve(uuid: string, type: AgentPortableItem["type"]) {
    if (!cache.has(uuid)) cache.set(uuid, actors.resolveCanonical(uuid, type));
    return cache.get(uuid)!;
  }
  const result: PreparedAdventureAgent[] = [];
  for (const preset of selected) {
    try {
      const img = await resolveAdventureAsset(definition, preset.portraitAssetId, input.assetSource);
      const token = await resolveAdventureAsset(definition, preset.tokenAssetId, input.assetSource);
      const profile = structuredClone(await resolve(preset.profile.uuid, "profile"));
      const occupation = await resolve(preset.occupation.uuid, "occupation");
      const abilities = await Promise.all(preset.abilities.map(r => resolve(r.uuid, "ability")));
      const grants = profile.system.abilityGrants;
      if (!Array.isArray(grants) || !grants.every(g => typeof record(g)?.uuid === "string")) throw new Error("Grants canônicos inválidos.");
      const original = grants.map(g => record(g)!.uuid as string);
      for (const replacement of preset.profileGrantReplacements ?? []) if (!original.includes(replacement.grantUuid)) throw new Error("Substituição de grant inválida.");
      const effective = original.map(uuid => preset.profileGrantReplacements?.find(r => r.grantUuid === uuid)?.replacementUuid ?? uuid);
      if (new Set(effective).size !== effective.length || effective.some(uuid => !abilities.some(a => a.uuid === uuid))) throw new Error("Grant efetivo ausente da lista desejada.");
      profile.system.abilityGrants = effective.map(uuid => ({ uuid }));
      const previous = byId.get(preset.id), actor = previous?.actor;
      const flag: AgentImportFlag = { importer: "actor", adventureId: definition.id, documentId: preset.id, version: 1,
        presetId: preset.id, presetRevision: input.revision, edition: pdf.edition!, act: preset.act,
        portraitAssetId: preset.portraitAssetId, tokenAssetId: preset.tokenAssetId, state: "incomplete", ...(previous?.flag.baseline ? { baseline: previous.flag.baseline } : {}) };
      const owned = actor ? managedItems(actor, previous!.flag) : [];
      const sameProfile = owned.find(i => i.type === "profile" && importFlag(i)?.uuid === profile.uuid);
      const profileId = sameProfile?._id ?? actors.newId();
      const grantSnapshots = actors.prepareProfileAbilities(actor?._id ?? null, profileId, profile, abilities.filter(a => effective.includes(a.uuid)));
      if (grantSnapshots.some(a => !effective.includes(a.uuid))) throw new Error("Plano de grants incompatível.");
      const items: PreparedAgentItem[] = [];
      const remove = new Set<string>();
      function selection(snapshot: AgentPortableItem) {
        const same = owned.find(i => i.type === snapshot.type && importFlag(i)?.uuid === snapshot.uuid);
        for (const item of actor?.items.filter(i => i.type === snapshot.type) ?? []) if (item._id !== same?._id) remove.add(item._id);
        items.push({ ...snapshot, id: same?._id ?? (snapshot.type === "profile" ? profileId : actors.newId()), existing: Boolean(same), grant: false });
      }
      selection(profile); selection(occupation);
      for (const snapshot of abilities) {
        const same = owned.find(i => i.type === "ability" && (importFlag(i)?.uuid ?? itemSourceUuid(i)) === snapshot.uuid);
        const manual = actor?.items.some(i => i.type === "ability" && !owned.includes(i) && itemSourceUuid(i) === snapshot.uuid);
        if (manual) { if (same) remove.add(same._id); continue; }
        const preparedGrant = grantSnapshots.find(g => g.uuid === snapshot.uuid);
        items.push({ ...(preparedGrant ?? snapshot), id: same?._id ?? actors.newId(), existing: Boolean(same), grant: effective.includes(snapshot.uuid) });
      }
      for (const i of owned) if (!items.some(p => p.id === i._id)) remove.add(i._id);
      const agent: PreparedAdventureAgent = { preset, flag, actorId: actor?._id ?? null, previousState: actor ? relevantAgentState(actor) : null,
        divergent: actor ? await hasAgentDivergence(actor, previous!.flag) : false, img, token, items, removeIds: [...remove], profileId };
      actors.validatePrepared(agent);
      result.push(agent);
    } catch (cause) { throw new Error(`${preset.act === "actOne" ? "Ato I" : "Ato II"} · ${preset.name}: ${cause instanceof Error ? cause.message : "Falha ao preparar agente."}`, { cause }); }
  }
  if (!actors.isAuthorized()) throw new Error("O GM ativo mudou. Execute a importação novamente.");
  return result;
}
