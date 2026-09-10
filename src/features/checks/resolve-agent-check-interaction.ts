import {
  buildAgentAttributeChoices,
  buildAgentCheck,
  type AgentCheckSelection,
} from "../../application/checks/build-agent-check";
import { openCheckDialog } from "../../applications/checks/check-dialog";
import { canUserRollActor } from "../../adapters/foundry/actors/agent-check-permission";
import { readAgentCheckSource } from "../../adapters/foundry/actors/read-agent-check-source";
import { executeFoundryCheck, type FoundryCheckExecution } from "../../adapters/foundry/dice/execute-foundry-check";
import {
  applyCheckExtraDice,
  applyCheckStepAdjustments,
  resolveCheckDifficulty,
  type CheckDifficultyResolution,
} from "../../core/checks/check";

export class AgentCheckPermissionError extends Error {
  constructor() {
    super("The current user cannot roll checks for this Actor.");
    this.name = "AgentCheckPermissionError";
  }
}

export interface ResolveAgentCheckInteractionOptions {
  readonly allowDifficulty?: boolean;
}

export interface ResolvedAgentCheckInteraction {
  readonly execution: FoundryCheckExecution;
  readonly difficultyResolution?: CheckDifficultyResolution;
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
  const dialogOptions = {
    ...(options.allowDifficulty === false ? { allowDifficulty: false } : {}),
    ...(selection.kind === "attribute"
      ? {}
      : { attributeChoices: buildAgentAttributeChoices(source, localize) }),
  };
  const dialogResult = Object.keys(dialogOptions).length === 0
    ? await openCheckDialog(input)
    : await openCheckDialog(input, dialogOptions);
  if (!dialogResult) return null;
  if (!canUserRollActor(actor, game.user)) throw new AgentCheckPermissionError();

  const selectedInput = dialogResult.selectedAttribute === undefined
    ? input
    : buildAgentCheck(selection, source, localize, dialogResult.selectedAttribute);
  const effectiveInput = applyCheckExtraDice(
    applyCheckStepAdjustments(selectedInput, dialogResult.stepAdjustments),
    dialogResult.extraDice,
  );
  const execution = await executeFoundryCheck(effectiveInput);
  const difficultyResolution = dialogResult.difficulty === undefined
    ? undefined
    : resolveCheckDifficulty(execution.result.total, dialogResult.difficulty);

  return {
    execution,
    ...(difficultyResolution ? { difficultyResolution } : {}),
  };
}
