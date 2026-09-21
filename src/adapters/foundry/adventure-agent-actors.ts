import { loadAvailableSingleItems, resolveSingleItemCatalogSource, type SingleItemCatalogDefinition, type SingleItemCatalogEntry } from "./items/single-item-catalog";
import { createAbilitySnapshot, type AbilityItemSnapshot } from "./abilities/ability-sources";
import { createProfileSnapshot, prepareAgentProfileAbilityReconciliation, createMissingProfileAbilities, deleteObsoleteProfileAbilities } from "../../features/profiles/manage-agent-profile";
import { createOccupationSnapshot } from "../../features/occupations/manage-agent-occupation";
import { readStoredAgentAccentColor, resolveEffectiveAgentAccentColor, SYSTEM_DEFAULT_ACCENT_COLOR } from "../../core/actors/agent-accent-color";
import { adventureDataRecord as record } from "../../core/adventure-import/adventure-agent-data";
import { ADVENTURE_ACTOR_FLAG_PATH as FLAG_PATH, actorDataDifferences, importFlag, itemProjection, preserveAbilityResourceValue, sourceDifferencePaths, stableSerialize, type AgentActorSource, type AgentImportFlag, type AgentItemSource } from "../../core/adventure-import/adventure-agent-reconciliation";
import type { AdventureAgentActorPort, AgentPortableItem, PreparedAdventureAgent, PreparedAgentItem } from "../../features/adventure-import/prepare-adventure-agents";
import { ADVENTURE_FOLDER_PLACEMENT_FLAG_PATH, type AdventureFolderPlacementFlag } from "../../features/adventure-import/adventure-folders";

const SCOPE = "ordemparanormal2", KEY = "adventureImport";
function actorById(id: string): foundry.documents.Actor {
  const actor = game.actors.get(id);
  if (!actor) throw new Error("Actor importado não encontrado.");
  return actor;
}
function actorSystem(agent: PreparedAdventureAgent) {
  return { level: agent.preset.level, attributes: agent.preset.attributes, skills: agent.preset.skills,
    resources: { health: { value: agent.preset.resources.healthMax, max: agent.preset.resources.healthMax },
      determination: { value: agent.preset.resources.determinationMax, max: agent.preset.resources.determinationMax } } };
}
function itemFlags(item: PreparedAgentItem, agent: PreparedAdventureAgent): Record<string, unknown> {
  return { [SCOPE]: { sourceUuid: item.uuid,
    ...(item.grant ? { profileGrant: { profileItemId: agent.profileId, abilityUuid: item.uuid } }
      : { [KEY]: { importer: "actorItem", adventureId: agent.flag.adventureId, documentId: agent.flag.documentId, uuid: item.uuid, version: 1 } }) } };
}
function itemCreation(item: PreparedAgentItem, agent: PreparedAdventureAgent) {
  return { _id: item.id, type: item.type, name: item.name, img: item.img, system: structuredClone(item.system),
    effects: structuredClone(item.effects ?? []), flags: itemFlags(item, agent) };
}
// Dotted updates reconcile portable system data while retaining unrelated flags and effects.
export function portableSystemUpdate(desired: Record<string, unknown>, current: Record<string, unknown>, path = "system"): Record<string, unknown> {
  const update: Record<string, unknown> = {};
  for (const key of Object.keys(current)) if (!Object.hasOwn(desired, key)) update[`${path}.${key}`] = new foundry.data.operators.ForcedDeletion();
  for (const [key, value] of Object.entries(desired)) {
    const object = record(value), old = record(current[key]);
    if (object && old) Object.assign(update, portableSystemUpdate(object, old, `${path}.${key}`));
    else update[`${path}.${key}`] = structuredClone(value);
  }
  return update;
}
export function createAdventureAgentActorPort(): AdventureAgentActorPort {
  const catalogs = new Map<string, Promise<readonly SingleItemCatalogEntry[]>>();
  const sources = new Map<string, foundry.documents.Item>();
  function authorized() { return game.user.isGM && game.users.activeGM?.id === game.user.id; }
  function guard() { if (!authorized()) throw new Error("Somente o GM ativo pode importar agentes."); }
  return {
    isAuthorized: authorized,
    newId: () => foundry.utils.randomID(),
    listActors: () => game.actors.contents.map((a: foundry.documents.Actor) => a.toObject() as unknown as AgentActorSource),
    async resolveCanonical(uuid, type): Promise<AgentPortableItem> {
      const definition: SingleItemCatalogDefinition = { itemType: type, worldLabelKey: "ORDEMPARANORMAL2.Common.World", unavailableSourceMessage: "Referência canônica indisponível." };
      if (!catalogs.has(type)) catalogs.set(type, loadAvailableSingleItems(definition));
      const matches = (await catalogs.get(type)!).filter(e => e.uuid === uuid && e.source.kind === "compendium" && e.source.packId === `ordemparanormal2.${type === "ability" ? "abilities" : `${type}s`}`);
      if (matches.length !== 1) throw new Error(`Referência canônica indisponível ou ambígua: ${uuid}`);
      const entry = matches[0];
      const source = await resolveSingleItemCatalogSource(entry.source, definition);
      if (source.type !== type || source.isEmbedded || source.uuid !== entry.uuid || source.id !== entry.source.documentId) throw new Error(`Documento canônico inválido: ${uuid}`);
      sources.set(entry.uuid, source);
      const snapshot = type === "profile" ? createProfileSnapshot(source) : type === "occupation" ? createOccupationSnapshot(source) : createAbilitySnapshot(source);
      return { uuid: entry.uuid, type, name: snapshot.name, img: snapshot.img, system: structuredClone(snapshot.system),
        ...("effects" in snapshot ? { effects: snapshot.effects } : {}) };
    },
    prepareProfileAbilities(actorId, profileId, profile, abilities) {
      const draft = actorId ? actorById(actorId) : new foundry.documents.Actor.implementation({ name: "Preparação", type: "agent" });
      const grants = profile.system.abilityGrants as { uuid: string }[];
      const resolved = grants.map(g => { const source = sources.get(g.uuid); if (!source) throw new Error("Fonte de grant não preparada."); return source; });
      const plan = prepareAgentProfileAbilityReconciliation(draft, profileId, grants, resolved);
      return plan.missingSnapshots.map(snapshot => {
        const uuid = snapshot.flags[SCOPE].sourceUuid;
        const portable = abilities.find(a => a.uuid === uuid);
        if (!portable) throw new Error("Grant ausente da lista desejada.");
        return { ...portable, system: snapshot.system, effects: snapshot.effects };
      });
    },
    validatePrepared(agent) {
      const previous = agent.actorId ? actorById(agent.actorId).toObject() as unknown as AgentActorSource : null;
      const system = actorSystem(agent);
      if (previous) {
        const resources = record(previous.system.resources);
        system.resources.health.value = record(resources?.health)?.value as number;
        system.resources.determination.value = record(resources?.determination)?.value as number;
      }
      const draft = new foundry.documents.Actor.implementation({ name: agent.preset.name, type: "agent", img: agent.img,
        system, prototypeToken: { texture: { src: agent.token } } }, { strict: true });
      if (!draft.validate({ strict: true })) throw new Error("Dados de Agent inválidos.");
      for (const item of agent.items) {
        const current = previous?.items.find(i => i._id === item.id);
        const desired = current && item.type === "ability" ? { ...item, system: preserveAbilityResourceValue(item.system, current.system) } : item;
        const model = new foundry.documents.Item.implementation(itemCreation(desired, agent), { parent: draft, strict: true });
        if (!model.validate({ strict: true })) throw new Error("Snapshot de Item inválido.");
      }
    },
    async createActor(agent, folderId, folderPlacement: AdventureFolderPlacementFlag) {
      guard();
      const profile = agent.items.find(i => i.type === "profile")!;
      const accent = record(profile.system)?.accentColor ?? SYSTEM_DEFAULT_ACCENT_COLOR;
      const result = await foundry.documents.Actor.implementation.create({ name: agent.preset.name, type: "agent", img: agent.img as foundry.documents.Actor["img"], folder: folderId,
        system: { ...actorSystem(agent), appearance: { accentColor: accent } }, prototypeToken: { texture: { src: agent.token as foundry.documents.TokenDocument["texture"]["src"] } },
        flags: { [SCOPE]: { [KEY]: agent.flag, adventureImportFolder: folderPlacement } } });
      const persisted = result?.toObject() as unknown as AgentActorSource | undefined;
      if (!result?.id || !persisted || importFlag(persisted)?.state !== "incomplete" || (persisted.folder ?? null) !== folderId
        || stableSerialize(record(persisted.flags?.[SCOPE])?.adventureImportFolder) !== stableSerialize(folderPlacement)) {
        throw new Error("Criação de Actor não confirmada.");
      }
      return result.id;
    },
    async updateFolderPlacement(id, folderId, flag) {
      guard();
      const actor = actorById(id);
      await actor.update({ folder: folderId, [ADVENTURE_FOLDER_PLACEMENT_FLAG_PATH]: flag });
      const source = actor.toObject() as unknown as AgentActorSource;
      const scope = record(source.flags?.[SCOPE]);
      if ((source.folder ?? null) !== folderId || stableSerialize(scope?.adventureImportFolder) !== stableSerialize(flag)) {
        throw new Error("Organização do Actor não confirmada.");
      }
    },
    async updateActor(id, agent) {
      guard(); const actor = actorById(id);
      const serialized = actor.toObject() as unknown as AgentActorSource;
      const currentProfile = serialized.items.find(i => i.type === "profile");
      const accent = readStoredAgentAccentColor(serialized.system) === null ? resolveEffectiveAgentAccentColor(serialized.system, currentProfile?.system) : null;
      await actor.update({ [FLAG_PATH]: agent.flag, "system.level": agent.preset.level,
        ...portableSystemUpdate(agent.preset.attributes, record(serialized.system.attributes) ?? {}, "system.attributes"),
        ...portableSystemUpdate(agent.preset.skills, record(serialized.system.skills) ?? {}, "system.skills"),
        "system.resources.health.max": agent.preset.resources.healthMax, "system.resources.determination.max": agent.preset.resources.determinationMax,
        img: agent.img, "prototypeToken.texture.src": agent.token, ...(accent ? { "system.appearance.accentColor": accent } : {}) });
      // An unchanged Document returns undefined; confirmation depends on persisted managed source.
      const persisted = actor.toObject() as unknown as AgentActorSource;
      const differences = [...actorDataDifferences(persisted, agent), ...sourceDifferencePaths(importFlag(persisted), agent.flag, FLAG_PATH)];
      if (differences.length) throw new Error(`Atualização de Actor não confirmada. Campo: ${differences[0]}.`);
    },
    async createItems(id, items, agent) {
      guard(); const actor = actorById(id);
      const direct = items.filter(i => !i.grant), grants = items.filter(i => i.grant);
      if (direct.length) {
        const result = await actor.createEmbeddedDocuments("Item", direct.map(i => itemCreation(i, agent)), { keepId: true });
        if (result.length !== direct.length) throw new Error("Criação de Items não confirmada.");
      }
      if (grants.length) {
        guard();
        await createMissingProfileAbilities(actor, {
          missingSnapshots: grants.map(i => itemCreation(i, agent) as unknown as AbilityItemSnapshot), obsoleteIds: [],
        }, true);
      }
      if (items.some(i => !actor.items.get(i.id))) throw new Error("Criação de Items não confirmada.");
    },
    async updateItems(id, items, agent) {
      guard(); const actor = actorById(id);
      const updates = items.map(item => {
        const current = actor.items.get(item.id);
        if (!current) throw new Error("Item gerenciado não encontrado.");
        const source = current.toObject() as unknown as { system: Record<string, unknown> };
        const system = item.type === "ability" ? preserveAbilityResourceValue(item.system, source.system) : item.system;
        const flags = record(itemFlags(item, agent)[SCOPE])!;
        return { _id: item.id, name: item.name, img: item.img, ...portableSystemUpdate(system, source.system),
          [`flags.${SCOPE}.sourceUuid`]: item.uuid,
          ...(item.grant ? { [`flags.${SCOPE}.profileGrant`]: flags.profileGrant, [`flags.${SCOPE}.${KEY}`]: new foundry.data.operators.ForcedDeletion() }
            : { [`flags.${SCOPE}.${KEY}`]: flags[KEY], [`flags.${SCOPE}.profileGrant`]: new foundry.data.operators.ForcedDeletion() }) };
      });
      await actor.updateEmbeddedDocuments("Item", updates);
      // Foundry omits unchanged Documents from the returned array; confirm persisted source instead.
      for (const item of items) {
        const current = actor.items.get(item.id);
        if (!current) throw new Error("Atualização de Items não confirmada.");
        const source = current.toObject() as unknown as AgentItemSource;
        const actualFlags = record(source.flags?.[SCOPE]) ?? {};
        const expectedFlags = record(itemFlags(item, agent)[SCOPE])!;
        const projection = (flags: Record<string, unknown>) => ({ sourceUuid: flags.sourceUuid,
          adventureImport: flags[KEY] ?? null, profileGrant: flags.profileGrant ?? null });
        if (stableSerialize(itemProjection(source)) !== stableSerialize(itemProjection(item))
          || stableSerialize(projection(actualFlags)) !== stableSerialize(projection(expectedFlags))) throw new Error("Atualização de Items não confirmada.");
      }
    },
    async deleteItems(id, ids) {
      guard(); const actor = actorById(id);
      const grants = ids.filter(i => {
        const item = actor.items.get(i);
        return item?.type === "ability" && record(record((item.toObject() as unknown as { flags?: Record<string, unknown> }).flags?.[SCOPE])?.profileGrant) !== null;
      });
      const others = ids.filter(i => !grants.includes(i));
      if (grants.length) {
        await deleteObsoleteProfileAbilities(actor, { missingSnapshots: [], obsoleteIds: [...grants] }, true);
      }
      if (others.length) {
        guard();
        const result = await actor.deleteEmbeddedDocuments("Item", [...others]);
        if (result.length !== others.length) throw new Error("Remoção de Items não confirmada.");
      }
      if (ids.some(i => actor.items.get(i))) throw new Error("Remoção de Items não confirmada.");
    },
    async completeActor(id, flag: AgentImportFlag) {
      guard(); const result = await actorById(id).update({ [FLAG_PATH]: flag });
      if (!result) throw new Error("Conclusão de Actor não confirmada.");
    },
  };
}
