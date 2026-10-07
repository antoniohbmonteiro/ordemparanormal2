import { NORMAL_DIE_STEPS, type NormalDieStep } from "../../core/dice/die-step";
import { validateUnlockValues } from "../../core/access-challenges/unlock";
import type { AgentCheckParticipantReference } from "../checks/agent-check-participant";
import { AccessChallengeError } from "./errors";

export interface CommonChallengeConfig {
  readonly participant: AgentCheckParticipantReference;
  readonly obstacle: string;
}

export interface UnlockConfig extends CommonChallengeConfig {
  readonly diceCount: number;
  readonly die: NormalDieStep;
  readonly resistance: number;
  readonly secretMode: "random" | "manual";
  readonly manualSecret?: readonly number[];
}

export interface BreakConfig extends CommonChallengeConfig {
  readonly difficulty: number;
  readonly pa: number;
}

export function validateUnlockConfig(config: UnlockConfig): void {
  if (!Number.isInteger(config.diceCount) || config.diceCount < 1 || config.diceCount > 6) {
    throw new AccessChallengeError("ORDEMPARANORMAL2.AccessChallenges.Validation.Positions");
  }
  if (!NORMAL_DIE_STEPS.includes(config.die)) throw new AccessChallengeError("ORDEMPARANORMAL2.AccessChallenges.Validation.Die");
  if (!Number.isInteger(config.resistance) || config.resistance < 1) throw new AccessChallengeError("ORDEMPARANORMAL2.AccessChallenges.Validation.Resistance");
  if (config.secretMode === "manual") {
    if (!config.manualSecret || config.manualSecret.length !== config.diceCount) throw new AccessChallengeError("ORDEMPARANORMAL2.AccessChallenges.Validation.ManualSecretLength");
    try { validateUnlockValues(config.manualSecret, config.die); }
    catch { throw new AccessChallengeError("ORDEMPARANORMAL2.AccessChallenges.Validation.ManualSecretFaces", { die: config.die }); }
  } else if (config.secretMode !== "random") throw new AccessChallengeError("ORDEMPARANORMAL2.AccessChallenges.Validation.SecretMode");
}

export function validateBreakConfig(config: BreakConfig): void {
  if (!config.obstacle.trim()) throw new AccessChallengeError("ORDEMPARANORMAL2.AccessChallenges.Validation.Obstacle");
  if (!Number.isInteger(config.difficulty) || config.difficulty < 1) throw new AccessChallengeError("ORDEMPARANORMAL2.AccessChallenges.Validation.Difficulty");
  if (!Number.isInteger(config.pa) || config.pa < 1) throw new AccessChallengeError("ORDEMPARANORMAL2.AccessChallenges.Validation.Pa");
}
