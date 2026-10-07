import {
  buildAgentAttributeChoices,
  buildAgentCheck,
  type AgentCheckSelection,
} from "../../application/checks/build-agent-check";
import { openCheckDialog, type CheckDialogResult } from "../../applications/checks/check-dialog";
import { canUserRollActor } from "../../adapters/foundry/actors/agent-check-permission";
import { readAgentCheckSource } from "../../adapters/foundry/actors/read-agent-check-source";
import { readAgentCheckAbilities } from "../../adapters/foundry/abilities/read-agent-check-abilities";
import { executeFoundryCheck, type FoundryCheckExecution } from "../../adapters/foundry/dice/execute-foundry-check";
import {
  applyCheckExtraDice,
  applyCheckStepAdjustments,
  resolveCheckDifficulty,
  type CheckDifficultyResolution,
  type CheckInput,
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
  readonly signal?: AbortSignal;
  readonly reservedHealth?: number;
}

export interface ResolvedAgentCheckInteraction {
  readonly execution: FoundryCheckExecution;
  readonly difficultyResolution?: CheckDifficultyResolution;
  readonly appliedAbilityUses: readonly AppliedCheckAbilityUse[];
}

export async function prepareAgentCheckInteraction(
  actor: foundry.documents.Actor,
  selection: AgentCheckSelection,
  options: ResolveAgentCheckInteractionOptions = {},
): Promise<CheckDialogResult | null> {
  if (!canUserRollActor(actor, game.user)) throw new AgentCheckPermissionError();

  const source = readAgentCheckSource(actor);
  const localize = (key: string): string => game.i18n.localize(key);
  const input = buildAgentCheck(selection, source, localize);
  const currentAbilitySource = readAgentCheckAbilities(actor);
  const reservedHealth = options.reservedHealth ?? 0;
  if (!Number.isInteger(reservedHealth) || reservedHealth < 0) throw new Error("Reserved health must be non-negative.");
  const abilitySource = { ...currentAbilitySource, health: Math.max(0, currentAbilitySource.health - reservedHealth) };
  const hasCheckAbilities = abilitySource.abilities.some((ability) =>
    ability.uses.some(({ checkIntegration }) => checkIntegration !== null),
  );
  const dialogOptions = {
    ...(options.signal ? { signal: options.signal } : {}),
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
  return dialogResult;
}

export function isAgentCheckChoices(value: unknown): value is CheckDialogResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const data = value as Record<string, unknown>;
  if (Object.keys(data).some(key => !["difficulty", "selectedAttribute", "stepAdjustments", "extraDice", "abilityUses"].includes(key))) return false;
  if (!data.stepAdjustments || typeof data.stepAdjustments !== "object" || Array.isArray(data.stepAdjustments)
    || !Object.values(data.stepAdjustments).every(step => Number.isInteger(step) && (step as number) >= -4 && (step as number) <= 4)
    || !Array.isArray(data.extraDice) || !Array.isArray(data.abilityUses)) return false;
  return data.extraDice.every(die => die && typeof die === "object" && die.source === "situational"
    && typeof die.id === "string" && typeof die.label === "string" && [4, 6, 8, 10, 12].includes(die.die))
    && data.abilityUses.every(use => use && typeof use === "object" && typeof use.abilityId === "string" && typeof use.useId === "string")
    && (data.selectedAttribute === undefined || ["physical", "mind", "emotion"].includes(data.selectedAttribute as string));
}

export function prepareAgentCheckExecution(actor: foundry.documents.Actor, selection: AgentCheckSelection,
  choices: CheckDialogResult, requester: foundry.documents.User = game.user) {
  if (!canUserRollActor(actor, requester)) throw new AgentCheckPermissionError();
  const selectedInput = buildAgentCheck(selection, readAgentCheckSource(actor), key => game.i18n.localize(key), choices.selectedAttribute);
  const preparedAbilityUses = prepareCheckAbilityUses(actor, selectedInput, choices.extraDice, choices.abilityUses);
  const effectiveInput: CheckInput = applyCheckExtraDice(applyCheckStepAdjustments(selectedInput, choices.stepAdjustments),
    [...choices.extraDice, ...preparedAbilityUses.extraDice]);
  return { selectedInput, preparedAbilityUses, effectiveInput };
}

export async function resolveAgentCheckInteraction(actor: foundry.documents.Actor, selection: AgentCheckSelection,
  options: ResolveAgentCheckInteractionOptions = {}): Promise<ResolvedAgentCheckInteraction | null> {
  const dialogResult = await prepareAgentCheckInteraction(actor, selection, options);
  if (!dialogResult) return null;
  const { selectedInput, preparedAbilityUses, effectiveInput } = prepareAgentCheckExecution(actor, selection, dialogResult);
  const execution = await executeFoundryCheck(effectiveInput);
  const appliedAbilityUses = await confirmCheckAbilityUses(actor, selectedInput, dialogResult.extraDice, preparedAbilityUses);
  const difficultyResolution = dialogResult.difficulty === undefined ? undefined
    : resolveCheckDifficulty(execution.result.total, dialogResult.difficulty);
  return { execution, appliedAbilityUses, ...(difficultyResolution ? { difficultyResolution } : {}) };
}
