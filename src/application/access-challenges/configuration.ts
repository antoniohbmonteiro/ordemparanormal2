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
    throw new AccessChallengeError("Escolha de 1 a 6 posições para a senha.");
  }
  if (!NORMAL_DIE_STEPS.includes(config.die)) throw new AccessChallengeError("Escolha um dado válido: d4, d6, d8, d10 ou d12.");
  if (!Number.isInteger(config.resistance) || config.resistance < 1) throw new AccessChallengeError("Informe uma Resistência inteira maior ou igual a 1.");
  if (config.secretMode === "manual") {
    if (!config.manualSecret || config.manualSecret.length !== config.diceCount) throw new AccessChallengeError("Preencha todas as posições da senha manual.");
    try { validateUnlockValues(config.manualSecret, config.die); }
    catch { throw new AccessChallengeError(`Escolha valores de 1 a ${config.die} para todas as posições da senha.`); }
  } else if (config.secretMode !== "random") throw new AccessChallengeError("Escolha geração de senha Aleatória ou Manual.");
}

export function validateBreakConfig(config: BreakConfig): void {
  if (!config.obstacle.trim()) throw new AccessChallengeError("Informe o obstáculo a ser arrombado.");
  if (!Number.isInteger(config.difficulty) || config.difficulty < 1) throw new AccessChallengeError("Informe uma DT inteira maior ou igual a 1.");
  if (!Number.isInteger(config.pa) || config.pa < 1) throw new AccessChallengeError("Informe uma PA inteira maior ou igual a 1.");
}
