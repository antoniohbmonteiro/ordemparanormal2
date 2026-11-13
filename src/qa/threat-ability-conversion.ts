import {
  hasLegacyThreatOverride, LEGACY_THREAT_ENTRY_FLAG, LEGACY_THREAT_PATHS, LEGACY_THREAT_SECTIONS,
  readLegacyThreatEntry, type LegacyThreatSection,
} from "../adapters/foundry/abilities/legacy-threat-entry";
import { ABILITY_ITEM_TYPE, SYSTEM_ID, THREAT_ACTOR_TYPE } from "../config/system-config";
import { FREE_ABILITY_COST } from "../core/abilities/ability-cost";
import { readAbilityCombatAction } from "../core/abilities/ability-use";
import type { ThreatDataModel } from "../documents/actor/threat-data-model";

type Actor = foundry.documents.Actor;
type Token = foundry.documents.TokenDocument;
type LegacyEntry = ThreatDataModel["actions"][number] | ThreatDataModel["characteristics"]["passiveEffects"][number];

function readEntries(actor: Actor, section: LegacyThreatSection): readonly LegacyEntry[] {
  const system = actor.system as unknown as ThreatDataModel;
  return section === "actions" ? system.actions : system.characteristics[section];
}

function sourceData(actor: Actor, section: LegacyThreatSection, entry: LegacyEntry, index: number) {
  const description = entry.description
    ? `<p>${foundry.utils.escapeHTML(entry.description).replace(/\r?\n/g, "<br>")}</p>` : "";
  const combatAction = section === "actions" ? readAbilityCombatAction(entry) : null;
  if (section === "actions" && !combatAction) throw new Error(`Ação inválida: ${entry.id}`);
  const uses = combatAction ? [{
    id: entry.id, name: entry.name, description, cost: FREE_ABILITY_COST, minimumLevel: null,
    checkIntegration: null, combatAction,
  }] : [];
  const characteristic = section === "passiveEffects" ? "passiveEffect" : section === "specialAbilities" ? "specialAbility" : null;
  return {
    name: entry.name, type: ABILITY_ITEM_TYPE, sort: (index + 1) * CONST.SORT_INTEGER_DENSITY,
    system: { description: combatAction ? "" : description, characteristic, uses },
    flags: { [SYSTEM_ID]: { [LEGACY_THREAT_ENTRY_FLAG]: {
      owner: actor.uuid, section, id: entry.id,
      source: JSON.stringify({ name: entry.name, description, combatAction }),
    } } },
  };
}

function collectSections(actor: Actor, token?: Token) {
  return LEGACY_THREAT_SECTIONS.flatMap((section) => {
    if (token && !hasLegacyThreatOverride(token, section)) return [];
    const entries = readEntries(actor, section);
    if (!token && !entries.length) return [];
    return [{ section, entries }];
  });
}

function collectWorld() {
  const tokens = new Map<string, Token[]>();
  for (const scene of game.scenes) {
    for (const token of scene.tokens) {
      if (token.isLinked || token.baseActor?.type !== THREAT_ACTOR_TYPE || !token.actorId) continue;
      const siblings = tokens.get(token.actorId) ?? [];
      siblings.push(token);
      tokens.set(token.actorId, siblings);
    }
  }
  return [...game.actors].filter((actor) => actor.type === THREAT_ACTOR_TYPE).flatMap((actor) => {
    const sections = collectSections(actor);
    const local = (tokens.get(actor.id ?? "") ?? []).flatMap((token) => {
      if (!token.actor) throw new Error(`Actor sintético indisponível: ${token.uuid}`);
      const sections = collectSections(token.actor, token);
      return sections.length ? [{ actor: token.actor, token, sections }] : [];
    });
    return sections.length || local.length ? [{ actor, sections, local }] : [];
  });
}

type WorldPlan = ReturnType<typeof collectWorld>;
type Section = ReturnType<typeof collectSections>[number];
type ConversionPreview = ReturnType<typeof describeWorld>;

function describeWorld(plan: WorldPlan) {
  return plan.flatMap(({ actor, sections, local }) => [
    { uuid: actor.uuid, sections },
    ...local.map(({ token, sections }) => ({ uuid: token.uuid, sections })),
  ]).map(({ uuid, sections }) => ({
    uuid,
    sections: sections.map(({ section, entries }) => ({ section, count: entries.length })),
    revision: JSON.stringify(sections),
  }));
}

function requireGm(): void {
  if (!game.user?.isGM) throw new Error("Somente o Mestre pode converter habilidades de ameaças.");
}

export function previewThreatAbilityConversion(): ConversionPreview {
  requireGm();
  return describeWorld(collectWorld());
}

function conversionCopies(actor: Actor, section: LegacyThreatSection, owner: string) {
  return [...actor.items].flatMap((item) => {
    const flag = readLegacyThreatEntry(item);
    return flag?.section === section && flag.owner === owner ? [{ item, flag }] : [];
  });
}

function planCopies(actor: Actor, { section, entries }: Section) {
  const existing = conversionCopies(actor, section, actor.uuid);
  const ids = new Set(entries.map(({ id }) => id));
  if (ids.size !== entries.length || existing.some(({ flag }) => !ids.has(flag.id))) {
    throw new Error(`Conflito nos registros legados: ${section}`);
  }
  return entries.flatMap((entry, index) => {
    const data = sourceData(actor, section, entry, index);
    const copies = existing.filter(({ flag }) => flag.id === entry.id);
    const expected = data.flags[SYSTEM_ID][LEGACY_THREAT_ENTRY_FLAG];
    if (copies.length > 1 || (copies[0] && copies[0].flag.source !== expected.source)) {
      throw new Error(`Conflito com habilidade convertida: ${entry.id}`);
    }
    if (copies.length) return [];
    const draft = new foundry.documents.Item.implementation(data, { parent: actor, strict: true });
    if (!draft.validate({ strict: true })) throw new Error(`Habilidade inválida: ${entry.id}`);
    return [data];
  });
}

async function materialize(actor: Actor, sections: readonly Section[], base?: Actor): Promise<void> {
  for (const section of sections) {
    const data = planCopies(actor, section);
    if (data.length) await actor.createEmbeddedDocuments("Item", data);
    if (planCopies(actor, section).length) throw new Error(`Criação incompleta: ${section.section}`);
    if (!base) continue;
    const inherited = conversionCopies(actor, section.section, base.uuid);
    const ids = inherited.flatMap(({ item }) => item.id ? [item.id] : []);
    if (ids.length) await actor.deleteEmbeddedDocuments("Item", ids);
    if (conversionCopies(actor, section.section, base.uuid).length) {
      throw new Error(`Exclusões locais incompletas: ${section.section}`);
    }
  }
}

let converting = false;

export async function convertThreatAbilities(preview: ConversionPreview) {
  requireGm();
  if (converting) throw new Error("Já existe uma conversão de ameaças em andamento.");
  const plan = collectWorld();
  if (JSON.stringify(preview) !== JSON.stringify(describeWorld(plan))) {
    throw new Error("Os dados mudaram. Gere uma nova prévia antes de converter.");
  }
  converting = true;
  const completed: string[] = [];
  const failed: { uuid: string; reason: string }[] = [];
  try {
    for (const { actor, sections, local } of plan) {
      let uuid = actor.uuid;
      try {
        for (const section of sections) planCopies(actor, section);
        for (const target of local) {
          uuid = target.token.uuid;
          for (const section of target.sections) planCopies(target.actor, section);
        }
        uuid = actor.uuid;
        await materialize(actor, sections);
        for (const target of local) {
          uuid = target.token.uuid;
          await materialize(target.actor, target.sections, actor);
        }
        uuid = actor.uuid;
        if (sections.length) {
          await actor.update(Object.fromEntries(sections.map(({ section }) => [LEGACY_THREAT_PATHS[section], []])));
          if (sections.some(({ section }) => readEntries(actor, section).length)) throw new Error("Limpeza do Actor incompleta.");
        }
        for (const target of local) {
          uuid = target.token.uuid;
          const delta = target.token.delta;
          if (!delta) throw new Error("ActorDelta indisponível.");
          const source = { system: delta.toObject().system };
          for (const { section } of target.sections) {
            const path = LEGACY_THREAT_PATHS[section].split(".").slice(0, -1).join(".");
            const container = foundry.utils.getProperty(source, path) as Record<string, unknown>;
            delete container[section];
          }
          await target.token.update({
            delta: { system: foundry.data.operators.ForcedReplacement.create(source.system) },
          });
          if (target.sections.some(({ section }) => hasLegacyThreatOverride(target.token, section))) {
            throw new Error("Limpeza do ActorDelta incompleta.");
          }
        }
        completed.push(actor.uuid);
      } catch (error) {
        failed.push({ uuid, reason: error instanceof Error ? error.message : String(error) });
      }
    }
    return { completed, failed };
  } finally {
    converting = false;
  }
}
