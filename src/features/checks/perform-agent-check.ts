import {
  buildAgentAttributeChoices,
  buildAgentCheck,
  type AgentCheckSelection,
} from "../../application/checks/build-agent-check";
import { openCheckDialog } from "../../applications/checks/check-dialog";
import { canUserRollActor } from "../../adapters/foundry/actors/agent-check-permission";
import { readAgentCheckSource } from "../../adapters/foundry/actors/read-agent-check-source";
import { publishCheckMessage } from "../../adapters/foundry/chat/publish-check-message";
import { executeFoundryCheck } from "../../adapters/foundry/dice/execute-foundry-check";
import {
  applyCheckExtraDice,
  applyCheckStepAdjustments,
  resolveCheckDifficulty,
} from "../../core/checks/check";

export class AgentCheckPermissionError extends Error {
  constructor() {
    super("The current user cannot roll checks for this Actor.");
    this.name = "AgentCheckPermissionError";
  }
}

export async function performAgentCheck(
  actor: foundry.documents.Actor,
  selection: AgentCheckSelection,
): Promise<void> {
  if (!canUserRollActor(actor, game.user)) {
    throw new AgentCheckPermissionError();
  }

  const source = readAgentCheckSource(actor);
  const localize = (key: string): string => game.i18n.localize(key);
  const input = buildAgentCheck(selection, source, localize);
  const dialogResult =
    selection.kind === "attribute"
      ? await openCheckDialog(input)
      : await openCheckDialog(input, {
          attributeChoices: buildAgentAttributeChoices(source, localize),
        });

  if (!dialogResult) return;

  if (!canUserRollActor(actor, game.user)) {
    throw new AgentCheckPermissionError();
  }

  const selectedInput =
    dialogResult.selectedAttribute === undefined
      ? input
      : buildAgentCheck(
          selection,
          source,
          localize,
          dialogResult.selectedAttribute,
        );
  const effectiveInput = applyCheckExtraDice(
    applyCheckStepAdjustments(selectedInput, dialogResult.stepAdjustments),
    dialogResult.extraDice,
  );
  const execution = await executeFoundryCheck(effectiveInput);
  const difficultyResolution =
    dialogResult.difficulty === undefined
      ? undefined
      : resolveCheckDifficulty(execution.result.total, dialogResult.difficulty);

  await publishCheckMessage(actor, execution, difficultyResolution);
}
