import { ADVENTURE_ACTOR_FLAG_PATH, actorDataDifferences, abilityGrant, buildAgentBaseline, importFlag, itemSourceUuid, itemProjection, managedDigest, sourceDifferencePaths,
  relevantAgentState, type AgentActorSource } from "../../core/adventure-import/adventure-agent-reconciliation";
import { prepareAdventureAgents, type PrepareAdventureAgentsInput, type PreparedAdventureAgent, type PreparedAgentItem } from "./prepare-adventure-agents";

export type AgentConflictDecision = "preserve" | "restore" | null;
export interface AgentImportCounts { created: number; updated: number; unchanged: number; preserved: number; cancelled: boolean }
export class AgentImportError extends Error {
  constructor(readonly stage: "preflight" | "confirmation" | "folder" | "actor" | "items" | "baseline", readonly agent: PreparedAdventureAgent | null,
    readonly counts: Readonly<AgentImportCounts>, message: string, options?: ErrorOptions) { super(message, options); this.name = "AgentImportError"; }
}
export interface ImportAdventureAgentsInput extends PrepareAdventureAgentsInput {
  readonly decide: (agents: readonly PreparedAdventureAgent[]) => Promise<AgentConflictDecision>;
  readonly onProgress?: (completed: number, total: number) => void | Promise<void>;
}
let importing = false;
function assertAuthorized(input: ImportAdventureAgentsInput) {
  if (!input.actors.isAuthorized()) throw new Error("O GM ativo mudou. Execute a importação novamente.");
}
async function actorDataMatches(actor: AgentActorSource, agent: PreparedAdventureAgent): Promise<boolean> {
  return actorDataDifferences(actor, agent).length === 0;
}
async function desiredMatches(actor: AgentActorSource, agent: PreparedAdventureAgent): Promise<boolean> {
  if (!await actorDataMatches(actor, agent)) return false;
  if (agent.removeIds.length) return false;
  for (const item of agent.items) {
    const current = actor.items.find(i => i._id === item.id);
    if (!current || !itemProvenanceMatches(current, item, agent) || await managedDigest(itemProjection(current)) !== await managedDigest(itemProjection(item))) return false;
  }
  const f = importFlag(actor);
  return f?.state === "complete" && f.presetRevision === agent.flag.presetRevision && f.edition === agent.flag.edition
    && f.portraitAssetId === agent.flag.portraitAssetId && f.tokenAssetId === agent.flag.tokenAssetId;
}
function itemProvenanceMatches(current: AgentActorSource["items"][number], item: PreparedAgentItem, agent: PreparedAdventureAgent): boolean {
  const f = importFlag(current), grant = abilityGrant(current);
  if (item.grant) return !f && itemSourceUuid(current) === item.uuid && grant?.abilityUuid === item.uuid && grant.profileItemId === agent.profileId;
  return !grant && f?.importer === "actorItem" && f.adventureId === agent.flag.adventureId && f.documentId === agent.flag.documentId && f.version === 1 && f.uuid === item.uuid;
}
export async function importAdventureAgents(input: ImportAdventureAgentsInput): Promise<AgentImportCounts> {
  const counts: AgentImportCounts = { created: 0, updated: 0, unchanged: 0, preserved: 0, cancelled: false };
  if (importing) throw new AgentImportError("preflight", null, counts, "Já existe uma importação de agentes em andamento.");
  importing = true;
  let stage: AgentImportError["stage"] = "preflight", current: PreparedAdventureAgent | null = null;
  try {
    const plans = await prepareAdventureAgents(input);
    stage = "confirmation";
    const divergent = plans.filter(p => p.divergent);
    const decision = divergent.length ? await input.decide(divergent) : "restore";
    if (decision === null) return { ...counts, cancelled: true };
    assertAuthorized(input);
    for (const agent of plans) {
      current = agent;
      assertAuthorized(input);
      if (agent.divergent && decision === "preserve") {
        counts.preserved++;
        await input.onProgress?.(counts.created + counts.updated + counts.unchanged + counts.preserved, plans.length);
        continue;
      }
      const live = input.actors.listActors();
      const matches = live.filter(a => importFlag(a)?.importer === "actor" && importFlag(a)?.adventureId === agent.flag.adventureId && importFlag(a)?.documentId === agent.flag.documentId);
      const actor = agent.actorId ? live.find(a => a._id === agent.actorId) : undefined;
      if (agent.actorId ? !actor || matches.length !== 1 || matches[0]._id !== agent.actorId || relevantAgentState(actor) !== agent.previousState : matches.length !== 0) {
        throw new Error("O estado do agente mudou após a preparação. Execute a importação novamente.");
      }
      if (actor && await desiredMatches(actor, agent) && !agent.divergent) {
        counts.unchanged++;
        await input.onProgress?.(counts.created + counts.updated + counts.unchanged + counts.preserved, plans.length);
        continue;
      }
      let id = agent.actorId;
      if (!id) {
        stage = "folder"; assertAuthorized(input);
        const folder = await input.actors.ensureFolder(agent.preset.act);
        stage = "actor"; assertAuthorized(input);
        if (input.actors.listActors().some(a => importFlag(a)?.importer === "actor" && importFlag(a)?.adventureId === agent.flag.adventureId && importFlag(a)?.documentId === agent.flag.documentId)) throw new Error("A identidade do agente mudou. Execute novamente.");
        id = await input.actors.createActor(agent, folder);
      } else {
        stage = "actor"; assertAuthorized(input);
        const beforeWrite = input.actors.listActors().find(a => a._id === id);
        if (!beforeWrite || relevantAgentState(beforeWrite) !== agent.previousState) throw new Error("O estado do agente mudou. Execute novamente.");
        await input.actors.updateActor(id, agent);
      }
      stage = "items";
      // Singleton replacements must be removed before creation; unrelated grants remain owned by their original Profile.
      const selectionIds = agent.removeIds.filter(itemId => actor?.items.some(i => i._id === itemId && (i.type === "profile" || i.type === "occupation")));
      if (selectionIds.length) { assertAuthorized(input); await input.actors.deleteItems(id, selectionIds); }
      const fresh = agent.items.filter(i => !i.existing);
      if (fresh.length) { assertAuthorized(input); await input.actors.createItems(id, fresh, agent); }
      const existing = agent.items.filter(i => i.existing);
      if (existing.length) { assertAuthorized(input); await input.actors.updateItems(id, existing, agent); }
      const obsolete = agent.removeIds.filter(itemId => !selectionIds.includes(itemId));
      if (obsolete.length) { assertAuthorized(input); await input.actors.deleteItems(id, obsolete); }
      const persisted = input.actors.listActors().find(a => a._id === id);
      if (!persisted) throw new Error("Actor persistido não encontrado.");
      for (const desired of agent.items) {
        const actual = persisted.items.find(i => i._id === desired.id);
        if (!actual || !itemProvenanceMatches(actual, desired, agent) || await managedDigest(itemProjection(actual)) !== await managedDigest(itemProjection(desired))) throw new Error("Dados persistidos de Item não confirmados.");
      }
      if (agent.removeIds.some(itemId => persisted.items.some(i => i._id === itemId))) throw new Error("Remoção de Item não confirmada.");
      const actorDifferences = [...actorDataDifferences(persisted, agent), ...sourceDifferencePaths(importFlag(persisted), agent.flag, ADVENTURE_ACTOR_FLAG_PATH)];
      if (actorDifferences.length) throw new Error(`Dados persistidos do Actor não confirmados. Campo: ${actorDifferences[0]}.`);
      const baseline = await buildAgentBaseline(persisted, agent.flag, agent.preset.abilities.map(a => a.uuid));
      stage = "baseline"; assertAuthorized(input);
      const beforeComplete = input.actors.listActors().find(a => a._id === id);
      if (!beforeComplete || relevantAgentState(beforeComplete) !== relevantAgentState(persisted)) throw new Error("O agente mudou antes da conclusão. Execute novamente.");
      await input.actors.completeActor(id, { ...agent.flag, baseline, state: "complete" });
      const complete = input.actors.listActors().find(a => a._id === id);
      if (!complete || importFlag(complete)?.state !== "complete" || await managedDigest(importFlag(complete)) !== await managedDigest({ ...agent.flag, baseline, state: "complete" })) throw new Error("Baseline não confirmado.");
      if (agent.actorId) counts.updated++; else counts.created++;
      await input.onProgress?.(counts.created + counts.updated + counts.unchanged + counts.preserved, plans.length);
    }
    return counts;
  } catch (cause) {
    throw new AgentImportError(stage, current, { ...counts }, cause instanceof Error ? cause.message : "Falha na importação de agentes.", { cause });
  } finally { importing = false; }
}
