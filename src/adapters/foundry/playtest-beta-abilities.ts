
import { BETA_ID } from "../../config/adventure-definitions/playtest-beta";
import { managedDigest, stableSerialize } from "../../core/adventure-import/adventure-agent-reconciliation";
import { readProfileAbilityGrants, uniqueProfileAbilityGrants } from "../../documents/item/profile-ability-grant-data";
import { BETA_CANONICAL_ABILITIES, betaAgentAbilityIds,
  type BetaAbilityId } from "../../features/adventure-import/playtest-beta-ability-identities";
import type { PreparedBetaAgent } from "../../features/adventure-import/parse-playtest-beta";
import { prepareAgentProfileAbilityReconciliation } from "../../features/profiles/manage-agent-profile";
import { createAbilitySnapshot, readOwnedAbilitySourceUuid, readProfileGrantedAbilityFlag } from "./abilities/ability-sources";
import { resolveSingleItemCatalogSource } from "./items/single-item-catalog";
import { betaDocumentHasChanges, betaDocumentPort, findBetaDocument, type BetaDocument, type BetaTarget } from "./playtest-beta-documents";

const PACK = "ordemparanormal2.abilities";
const PREFIX = "Compendium." + PACK + ".Item.";
const abilityCatalog = { itemType: "ability", worldLabelKey: "ORDEMPARANORMAL2.Common.World",
  unavailableSourceMessage: "Falta uma fonte de habilidade Beta no compêndio Habilidades. Atualize os compêndios do sistema." };
const asItem = (value: BetaDocument) => value as unknown as foundry.documents.Item;
type Save = (target: BetaTarget, parent?: BetaDocument) => Promise<BetaDocument>;

export async function prepareBetaAbilitySources(agents: readonly PreparedBetaAgent[]) {
  const ids = new Set(agents.flatMap(agent => betaAgentAbilityIds(agent)));
  const sources = new Map<BetaAbilityId, foundry.documents.Item>();
  for (const id of ids) {
    const uuid = BETA_CANONICAL_ABILITIES[id];
    if (!uuid.startsWith(PREFIX)) throw new Error("UUID canônico de habilidade Beta inválido: " + uuid);
    const documentId = uuid.slice(PREFIX.length);
    const source = await resolveSingleItemCatalogSource({ kind: "compendium", packId: PACK, documentId }, abilityCatalog);
    if (source.uuid !== uuid || source.pack !== PACK || source.id !== documentId || source.isEmbedded)
      throw new Error("Fonte canônica de habilidade inválida: " + uuid);
    sources.set(id, source);
  }
  return sources;
}

function legacyWorldTarget(agent: PreparedBetaAgent) {
  return { type: "Item", id: "agent:" + agent.id + ":grant-source", name: agent.abilities[0].name } as const;
}

async function legacySource(uuid: string | null, agent: PreparedBetaAgent, id: BetaAbilityId, index: number) {
  if (!uuid) return undefined;
  const world = /^Item\.[A-Za-z0-9]{16}$/u.test(uuid);
  const compendium = /^Compendium\.world\.[a-z0-9_-]+\.Item\.[A-Za-z0-9]{16}$/iu.test(uuid);
  if ((!world && !compendium) || (world && index !== 0)) return undefined;
  const identity = world ? legacyWorldTarget(agent).id : "ability-source:" + id;
  const source = await fromUuid(uuid) as unknown as BetaDocument | null;
  if (source) {
    const flag = source.getFlag("ordemparanormal2", "adventureImport") as
      { version?: number; adventureId?: string; importer?: string; documentId?: string } | undefined;
    return source.type === "ability" && source.uuid === uuid && flag?.version === 1 && flag.adventureId === BETA_ID
      && flag.importer === "Item" && flag.documentId === identity ? { uuid, source } : undefined;
  }
  const expected = (await managedDigest({ beta: BETA_ID, type: "Item", documentId: identity })).slice(0, 16);
  return uuid.endsWith("." + expected) ? { uuid, source: null } : undefined;
}

async function relinkProfile(profile: BetaDocument, oldUuids: ReadonlySet<string>, uuid: string, guard: () => void) {
  const previous = readProfileAbilityGrants(profile.toObject().system);
  if (!previous.some(grant => oldUuids.has(grant.uuid))) return;
  const next = uniqueProfileAbilityGrants(previous.map(grant => oldUuids.has(grant.uuid) ? { uuid } : grant));
  guard();
  await profile.update({ "system.abilityGrants": next });
  if (stableSerialize(readProfileAbilityGrants(profile.toObject().system)) !== stableSerialize(next))
    throw new Error("Vínculo do Perfil Beta não confirmado: " + profile.name + ".");
}

export async function importBetaAgentAbilities(agent: PreparedBetaAgent, actor: BetaDocument,
  sources: ReadonlyMap<BetaAbilityId, foundry.documents.Item>, save: Save, guard: () => void): Promise<void> {
  const ids = betaAgentAbilityIds(agent);
  const parent = actor as unknown as foundry.documents.Actor;
  const items = betaDocumentPort("Item", actor);
  const grantSource = sources.get(ids[0])!;
  const profileTarget = { type: "Item", id: "agent:" + agent.id + ":profile", name: agent.profile } as const;
  const ownedProfile = findBetaDocument(items, profileTarget);
  const existingProfile = items.list().find(entry => entry.type === "profile");
  const profile = existingProfile ?? await save({ ...profileTarget, source: {
    type: "profile", system: { abilityGrants: [{ uuid: grantSource.uuid }] },
  }, managed: { "system.abilityGrants": [{ uuid: grantSource.uuid }] } }, actor);

  const firstTarget = { type: "Item", id: "agent:" + agent.id + ":ability:0", name: grantSource.name } as const;
  const ownedGrant = findBetaDocument(items, firstTarget);
  const legacyGrants = new Set<string>();
  if (ownedProfile?.id === profile.id) {
    for (const { uuid } of readProfileAbilityGrants(profile.toObject().system)) {
      if (await legacySource(uuid, agent, ids[0], 0)) legacyGrants.add(uuid);
    }
  }
  const legacyManual = items.list().some(entry => entry.type === "ability" && entry.id !== ownedGrant?.id
    && legacyGrants.has(readOwnedAbilitySourceUuid(asItem(entry)) ?? ""));
  if (legacyGrants.size && !legacyManual) await relinkProfile(profile, legacyGrants, grantSource.uuid, guard);

  for (const [index, id] of ids.entries()) {
    const source = sources.get(id)!;
    const target = { type: "Item", id: "agent:" + agent.id + ":ability:" + index, name: source.name } as const;
    const existing = findBetaDocument(items, target);
    const matching = items.list().some(entry => entry.type === "ability" && readOwnedAbilitySourceUuid(asItem(entry)) === source.uuid);
    if (matching) continue;
    const granted = index === 0;
    const profileGrantsSource = readProfileAbilityGrants(profile.toObject().system).some(grant => grant.uuid === source.uuid);
    if (granted && (!profileGrantsSource || legacyManual)) continue;
    if (existing) {
      if (existing.type !== "ability") throw new Error("Habilidade incorporada Beta incompatível: " + existing.name + ".");
      const oldUuid = readOwnedAbilitySourceUuid(asItem(existing));
      const grant = readProfileGrantedAbilityFlag(asItem(existing));
      if (granted ? grant?.profileItemId !== profile.id || !oldUuid : !!grant) continue;
      const legacy = await legacySource(oldUuid, agent, id, index);
      if (oldUuid && !legacy) continue;
      const current = existing.toObject().system as { resource?: unknown; uses?: unknown[]; description?: unknown } | undefined;
      const snapshot = createAbilitySnapshot(source);
      const oldSystem = legacy?.source?.toObject().system as typeof current;
      const importerDefaults = !oldUuid || current?.description === oldSystem?.description || !!oldUuid?.startsWith("Item.");
      const untouchedDescription = importerDefaults && !await betaDocumentHasChanges(items, { ...target, source: {}, managed: {} });
      const initialFields = untouchedDescription ? {
        ...(current?.resource == null && snapshot.system.resource ? { "system.resource": snapshot.system.resource } : {}),
        ...(current?.uses?.length === 0 && Array.isArray(snapshot.system.uses) && snapshot.system.uses.length > 0
          ? { "system.uses": snapshot.system.uses } : {}),
      } : {};
      const printedName = agent.abilities[index].name;
      guard();
      await existing.update({
        ...initialFields,
        ...(existing.name.toLocaleUpperCase("pt-BR") === printedName ? { name: source.name } : {}),
        "flags.ordemparanormal2.sourceUuid": source.uuid,
        ...(granted ? { "flags.ordemparanormal2.profileGrant.abilityUuid": source.uuid } : {}),
      });
      if (readOwnedAbilitySourceUuid(asItem(existing)) !== source.uuid)
        throw new Error("Origem da habilidade incorporada não confirmada: " + source.name + ".");
      continue;
    }
    const snapshot = granted
      ? prepareAgentProfileAbilityReconciliation(parent, profile.id, [{ uuid: source.uuid }], [source]).missingSnapshots[0]
      : createAbilitySnapshot(source);
    if (snapshot) await save({ ...target, source: { ...snapshot }, managed: {} }, actor);
  }
}

interface RetainedBetaSource { uuid: string; name: string; references: (string | undefined)[] }

export async function auditBetaLegacyAbilities(agents: readonly PreparedBetaAgent[], previous: readonly RetainedBetaSource[] = []) {
  const worldItems = betaDocumentPort("Item");
  const actors = betaDocumentPort("Actor");
  const sources = new Map(previous.map(({ uuid, name }) => [uuid, name]));
  for (const agent of agents) {
    const oldWorld = findBetaDocument(worldItems, legacyWorldTarget(agent));
    if (oldWorld?.type === "ability") sources.set(oldWorld.uuid, oldWorld.name);
    const actor = findBetaDocument(actors, { type: "Actor", id: "agent:" + agent.id, name: agent.name });
    if (!actor) continue;
    const items = betaDocumentPort("Item", actor).list();
    const grants = items.filter(item => item.type === "profile").flatMap(item => readProfileAbilityGrants(item.toObject().system));
    for (const [index, id] of betaAgentAbilityIds(agent).entries()) {
      const copy = findBetaDocument(betaDocumentPort("Item", actor), {
        type: "Item", id: "agent:" + agent.id + ":ability:" + index, name: agent.abilities[index].name,
      });
      const uuid = copy && readOwnedAbilitySourceUuid(asItem(copy));
      for (const candidate of [uuid || null, ...(index === 0 ? grants.map(grant => grant.uuid) : [])]) {
        if (!candidate || sources.has(candidate)) continue;
        const legacy = await legacySource(candidate, agent, id, index);
        if (legacy?.source) sources.set(legacy.uuid, legacy.source.name);
      }
    }
  }
  if (!sources.size) return [];
  const collections = (game as typeof game & { collections: Map<string, { contents: unknown[] }> }).collections;
  const documents = [...collections.values()].flatMap(collection => collection.contents).flatMap(candidate => {
    const doc = candidate as Partial<BetaDocument>;
    return typeof doc.toObject === "function" ? [{ uuid: doc.uuid, data: JSON.stringify(doc.toObject()) }] : [];
  });
  return [...sources].map(([uuid, name]) => {
    const escaped = uuid.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
    const match = new RegExp(escaped + "(?![A-Za-z0-9])", "u");
    return { uuid, name, references: documents.filter(doc => doc.uuid !== uuid && match.test(doc.data)).map(doc => doc.uuid) };
  });
}
