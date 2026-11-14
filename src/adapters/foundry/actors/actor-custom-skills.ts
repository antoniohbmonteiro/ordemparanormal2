import { isCustomSkillKey, readSkillDie, type CustomSkillKey, type CustomSkillValues } from "../../../core/actors/custom-skills";
import { readAbilityUses } from "../../../core/abilities/ability-use";
import type { SkillDieStep } from "../../../config/skills";
import { ABILITY_ITEM_TYPE, AGENT_ACTOR_TYPE, THREAT_ACTOR_TYPE } from "../../../config/system-config";
import { worldCustomSkillOptions } from "./custom-skill-catalog";

export function actorCustomSkills(actor: foundry.documents.Actor | null | undefined): CustomSkillValues {
  return (actor?.system as { readonly customSkills?: CustomSkillValues } | undefined)?.customSkills ?? {};
}

export function availableActorCustomSkills(actor: foundry.documents.Actor) {
  const values = actorCustomSkills(actor);
  return worldCustomSkillOptions().filter(option => !option.archived && readSkillDie(values[option.key]) !== undefined);
}

export function resolveOwnedCustomSkill(actor: foundry.documents.Actor, key: CustomSkillKey) {
  const die = readSkillDie(actorCustomSkills(actor)[key]);
  const option = worldCustomSkillOptions().find(entry => entry.key === key);
  return option && die !== undefined ? { option, die } : undefined;
}

const pending = new Map<string, Promise<unknown>>();

export function updateActorCustomSkill(
  actor: foundry.documents.Actor, key: CustomSkillKey, value: SkillDieStep | null,
  operation: "add" | "edit" | "remove", canEdit: () => boolean,
): Promise<void> {
  const queueKey = actor.token?.uuid ?? actor.uuid;
  const next = (pending.get(queueKey) ?? Promise.resolve()).catch(() => undefined).then(async () => {
    const token = actor.token;
    const current = token ? token.actor : actor;
    if (!current || !canEdit() || !current.canUserModify(game.user, "update")) throw new Error("Sem permissão para editar perícias.");
    if (current.type !== AGENT_ACTOR_TYPE && current.type !== THREAT_ACTOR_TYPE)
      throw new Error("Este personagem não aceita perícias personalizadas.");
    if (!isCustomSkillKey(key) || (operation !== "remove" && readSkillDie(value) === undefined))
      throw new Error("Perícia ou dado inválido.");
    const possessed = readSkillDie(actorCustomSkills(current)[key]) !== undefined;
    if (operation === "add" && !worldCustomSkillOptions().some(option => option.key === key && !option.archived))
      throw new Error("Esta perícia não está disponível para adição.");
    if (operation === "add" ? possessed : !possessed) return;
    if (operation === "remove" && current.items?.some(item => {
      const system = item.system;
      if (item.type !== ABILITY_ITEM_TYPE || !system || !("uses" in system)) return false;
      return readAbilityUses(system.uses)?.some(({ checkIntegration, combatAction }) =>
        (combatAction?.check?.kind === "skill" && combatAction.check.key === key)
        || (checkIntegration?.modification.applicability.type === "skill" && checkIntegration.modification.applicability.skill === key)) === true;
    })) throw new Error("Esta perícia está em uso por uma habilidade do personagem.");
    const inherited = token && !token.isLinked && readSkillDie(actorCustomSkills(token.baseActor)[key]) !== undefined;
    const nextValue = operation === "remove" ? inherited ? null : new foundry.data.operators.ForcedDeletion() : value;
    if (!await current.update({ [`system.customSkills.${key}`]: nextValue })) throw new Error("A atualização da perícia não foi confirmada.");
  });
  pending.set(queueKey, next);
  return next.finally(() => { if (pending.get(queueKey) === next) pending.delete(queueKey); });
}
