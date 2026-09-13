import {
  buildAgentAttributeChoices,
  buildAgentCheck,
  type AgentCheckSelection,
} from "../../application/checks/build-agent-check";
import { openCheckDialog } from "../../applications/checks/check-dialog";
import { canUserRollActor } from "../../adapters/foundry/actors/agent-check-permission";
import { readAgentCheckSource } from "../../adapters/foundry/actors/read-agent-check-source";
import { readAgentCheckAbilities } from "../../adapters/foundry/abilities/read-agent-check-abilities";
import { executeFoundryCheck, type FoundryCheckExecution } from "../../adapters/foundry/dice/execute-foundry-check";
import {
  applyCheckExtraDice,
  applyCheckStepAdjustments,
  resolveCheckDifficulty,
  type CheckDifficultyResolution,
} from "../../core/checks/check";
import type { AppliedCheckAbilityUse } from "../../application/checks/check-ability-use-state";
import { confirmCheckAbilityUses, prepareCheckAbilityUses } from "./check-ability-uses";

export class AgentCheckPermissionError extends Error {
  constructor() {
    super("The current user cannot roll checks for this Actor.");
    this.name = "AgentCheckPermissionError";
  }
}

export interface ResolveAgentCheckInteractionOptions {
  readonly allowDifficulty?: boolean;
  readonly lockedDifficulty?: number;
}

export interface ResolvedAgentCheckInteraction {
  readonly execution: FoundryCheckExecution;
  readonly difficultyResolution?: CheckDifficultyResolution;
  readonly appliedAbilityUses: readonly AppliedCheckAbilityUse[];
}

export async function resolveAgentCheckInteraction(
  actor: foundry.documents.Actor,
  selection: AgentCheckSelection,
  options: ResolveAgentCheckInteractionOptions = {},
): Promise<ResolvedAgentCheckInteraction | null> {
  if (!canUserRollActor(actor, game.user)) throw new AgentCheckPermissionError();

  const source = readAgentCheckSource(actor);
  const localize = (key: string): string => game.i18n.localize(key);
  const input = buildAgentCheck(selection, source, localize);
  const abilitySource = readAgentCheckAbilities(actor);
  const hasCheckAbilities = abilitySource.abilities.some((ability) =>
    ability.uses.some(({ checkIntegration }) => checkIntegration !== null),
  );
  const dialogOptions = {
    ...(options.allowDifficulty === false ? { allowDifficulty: false } : {}),
    ...(options.lockedDifficulty !== undefined
      ? { lockedDifficulty: options.lockedDifficulty }
      : {}),
    ...(selection.kind === "attribute"
      ? {}
      : { attributeChoices: buildAgentAttributeChoices(source, localize) }),
    ...(hasCheckAbilities ? { abilitySource } : {}),
  };
  const dialogResult = Object.keys(dialogOptions).length === 0
    ? await openCheckDialog(input)
    : await openCheckDialog(input, dialogOptions);
  if (!dialogResult) return null;
  if (!canUserRollActor(actor, game.user)) throw new AgentCheckPermissionError();

  const currentSource = readAgentCheckSource(actor);
  const selectedInput = buildAgentCheck(
    selection,
    currentSource,
    localize,
    dialogResult.selectedAttribute,
  );
  const preparedAbilityUses = prepareCheckAbilityUses(
    actor,
    selectedInput,
    dialogResult.extraDice,
    dialogResult.abilityUses,
  );
  const effectiveInput = applyCheckExtraDice(
    applyCheckStepAdjustments(selectedInput, dialogResult.stepAdjustments),
    [...dialogResult.extraDice, ...preparedAbilityUses.extraDice],
  );
  const execution = await executeFoundryCheck(effectiveInput);
  const appliedAbilityUses = await confirmCheckAbilityUses(
    actor,
    selectedInput,
    dialogResult.extraDice,
    preparedAbilityUses,
  );
  const difficultyResolution = dialogResult.difficulty === undefined
    ? undefined
    : resolveCheckDifficulty(execution.result.total, dialogResult.difficulty);

  return {
    execution,
    appliedAbilityUses,
    ...(difficultyResolution ? { difficultyResolution } : {}),
  };
}
