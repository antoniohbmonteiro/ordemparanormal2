import { canUserRollActor } from "../../adapters/foundry/actors/agent-check-permission";
import { publishCheckMessage } from "../../adapters/foundry/chat/publish-check-message";
import { executeFoundryCheck } from "../../adapters/foundry/dice/execute-foundry-check";
import {
  buildActorAttributeChoices, buildActorCheck, parseActorCheckSelection, type ActorCheckSelection,
} from "../../application/checks/build-actor-check";
import { openCheckDialog } from "../../applications/checks/check-dialog";
import type { AttributeKey } from "../../core/actors/agent-attributes";
import { applyCheckExtraDice, applyCheckStepAdjustments, resolveCheckDifficulty } from "../../core/checks/check";
import { ThreatDataModel } from "../../documents/actor/threat-data-model";
import { worldCustomSkillOptions } from "../../adapters/foundry/actors/custom-skill-catalog";
import { isCustomSkillKey, readSkillDie } from "../../core/actors/custom-skills";

export type ThreatCheckIntent = ActorCheckSelection | { readonly kind: "action"; readonly id: string };
export type ThreatCheckOutcome = "published" | "cancelled" | "changed" | "forbidden";

function prepareCheck(actor: foundry.documents.Actor, intent: ThreatCheckIntent, attribute?: AttributeKey) {
  if (!(actor.system instanceof ThreatDataModel)) return;
  const system = actor.system;
  const action = intent.kind === "action" ? system.actions.find(({ id }) => id === intent.id) : undefined;
  const selection = intent.kind === "action"
    ? action?.check && parseActorCheckSelection(action.check.kind, action.check.key)
    : intent;
  if (!selection) return;
  const localize = (key: string) => game.i18n.localize(key);
  const getSkillDie = ({ kind, key }: Exclude<ActorCheckSelection, { kind: "attribute" }>) =>
    isCustomSkillKey(key) ? readSkillDie(system.customSkills?.[key])
      : system.skills.find((entry) => entry.kind === kind && entry.key === key)?.die;
  if (selection.kind !== "attribute" && getSkillDie(selection) === undefined) return;
  const customSkillOptions = worldCustomSkillOptions();
  if (selection.kind === "skill" && isCustomSkillKey(selection.key)
    && !customSkillOptions.some(option => option.key === selection.key)) return;
  const check = buildActorCheck(selection, { attributes: system.attributes, getSkillDie, customSkillOptions }, localize,
    attribute ?? action?.check?.attribute ?? undefined);
  const input = action ? { ...check, check: { ...check.check, name: action.name } } : check;
  const attributeChoices = selection.kind === "attribute" ? undefined
    : buildActorAttributeChoices(system.attributes, localize);
  return { input, attributeChoices, action };
}

export async function performThreatCheck(
  actor: foundry.documents.Actor,
  intent: ThreatCheckIntent,
  token?: foundry.documents.TokenDocument,
): Promise<ThreatCheckOutcome> {
  if (!game.user || !canUserRollActor(actor, game.user)) return "forbidden";
  const initial = prepareCheck(actor, intent);
  if (!initial) return "changed";
  const expected = JSON.stringify(initial);
  const choices = await openCheckDialog(initial.input,
    initial.attributeChoices ? { attributeChoices: initial.attributeChoices } : undefined);
  if (!choices) return "cancelled";
  if (!game.user || !canUserRollActor(actor, game.user)) return "forbidden";
  if (JSON.stringify(prepareCheck(actor, intent)) !== expected) return "changed";
  const selected = prepareCheck(actor, intent, choices.selectedAttribute);
  if (!selected) return "changed";

  const adjusted = applyCheckStepAdjustments(selected.input, choices.stepAdjustments);
  const execution = await executeFoundryCheck(applyCheckExtraDice(adjusted, choices.extraDice));
  const difficulty = choices.difficulty === undefined ? undefined
    : resolveCheckDifficulty(execution.result.total, choices.difficulty);
  await publishCheckMessage(actor, execution, difficulty, [], undefined, token);
  return "published";
}
