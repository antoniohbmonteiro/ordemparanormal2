import { readAgentCheckSource } from "../../adapters/foundry/actors/read-agent-check-source";
import { publishAbilityMessage } from "../../adapters/foundry/chat/publish-ability-message";
import { publishCheckMessage } from "../../adapters/foundry/chat/publish-check-message";
import { executeFoundryCheck, type FoundryCheckExecution } from "../../adapters/foundry/dice/execute-foundry-check";
import { buildActorAttributeChoices, buildActorCheck, type ActorCheckSource } from "../../application/checks/build-actor-check";
import { buildAgentCheck } from "../../application/checks/build-agent-check";
import { openCheckDialog } from "../../applications/checks/check-dialog";
import { AGENT_ACTOR_TYPE, THREAT_ACTOR_TYPE } from "../../config/system-config";
import type { AbilityCombatAction } from "../../core/abilities/ability-use";
import { readAbilityUses } from "../../core/abilities/ability-use";
import type { AttributeKey } from "../../core/actors/agent-attributes";
import { applyCheckExtraDice, applyCheckStepAdjustments, resolveCheckDifficulty } from "../../core/checks/check";
import type { ThreatDataModel } from "../../documents/actor/threat-data-model";
import { threatAbilityRestriction, useAbility, type AbilityUseResult } from "./use-ability";

type FormResult = AbilityUseResult | { status: "cancelled" | "missing-check" | "publication-failed" };

export function buildAbilityActionCheck(
  actor: foundry.documents.Actor,
  check: NonNullable<AbilityCombatAction["check"]>,
  name: string,
  attribute?: AttributeKey,
) {
  const localize = (key: string) => game.i18n.localize(key);
  let input;
  let attributes: ActorCheckSource["attributes"];
  if (actor.type === THREAT_ACTOR_TYPE) {
    const system = actor.system as unknown as Pick<ThreatDataModel, "attributes" | "skills">;
    attributes = system.attributes;
    const getSkillDie: ActorCheckSource["getSkillDie"] = (selection) =>
      system.skills.find((skill) => skill.kind === selection.kind && skill.key === selection.key)?.die;
    if (check.kind !== "attribute" && getSkillDie(check) === undefined) return;
    input = buildActorCheck(check, { attributes, getSkillDie }, localize, attribute ?? check.attribute ?? undefined);
  } else if (actor.type === AGENT_ACTOR_TYPE) {
    const source = readAgentCheckSource(actor);
    attributes = source.attributes;
    input = buildAgentCheck(check, source, localize, attribute ?? check.attribute ?? undefined);
  } else return;
  return {
    input: { ...input, check: { ...input.check, name } },
    attributeChoices: check.kind === "attribute" ? undefined : buildActorAttributeChoices(attributes, localize),
  };
}

export async function executeAbilityForm(
  actor: foundry.documents.Actor, ability: foundry.documents.Item, useId: string,
): Promise<FormResult> {
  const token = actor.token ?? undefined;
  if ((!actor.isOwner && !game.user.isGM) || ability.actor !== actor) return { status: "forbidden" };
  const use = readAbilityUses(ability.system && "uses" in ability.system ? ability.system.uses : undefined)
    ?.find(({ id }) => id === useId);
  if (!use) return { status: "changed" };
  const restriction = actor.type === THREAT_ACTOR_TYPE ? threatAbilityRestriction(use) : null;
  if (restriction) return { status: "unavailable", reason: restriction };
  const check = use.combatAction?.check;
  let execution: FoundryCheckExecution | undefined;
  let difficulty: number | undefined;
  let result: AbilityUseResult;
  if (check) {
    const initial = buildAbilityActionCheck(actor, check, use.name);
    if (!initial) return { status: "missing-check" };
    const baseline = JSON.stringify(initial);
    const choices = await openCheckDialog(initial.input, { attributeChoices: initial.attributeChoices });
    if (!choices) return { status: "cancelled" };
    difficulty = choices.difficulty;
    const unchanged = () => JSON.stringify(buildAbilityActionCheck(actor, check, use.name)) === baseline;
    result = await useAbility(actor, ability, useId, {
      expected: use,
      evaluate: async () => {
        if (!unchanged()) return false;
        const current = buildAbilityActionCheck(actor, check, use.name, choices.selectedAttribute);
        if (!current) return false;
        const adjusted = applyCheckStepAdjustments(current.input, choices.stepAdjustments);
        execution = await executeFoundryCheck(applyCheckExtraDice(adjusted, choices.extraDice));
        return unchanged();
      },
    });
  } else {
    result = await useAbility(actor, ability, useId);
  }
  if (result.status !== "success") return result;
  try {
    if (execution) {
      const resolution = difficulty === undefined ? undefined : resolveCheckDifficulty(execution.result.total, difficulty);
      const message = await publishCheckMessage(actor, execution, resolution, [], undefined, token);
      if (!message) return { status: "publication-failed" };
    } else {
      await publishAbilityMessage(actor, ability, result, token ? { token } : undefined);
    }
  } catch (error) {
    console.error("ordemparanormal2 | Ability execution completed but chat publication failed.", error);
    return { status: "publication-failed" };
  }
  return result;
}
