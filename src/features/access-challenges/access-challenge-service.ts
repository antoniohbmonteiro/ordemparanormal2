import { createBreakState, recordBreakAttempt } from "../../core/access-challenges/break";
import { advanceUnlockRound, createUnlockState, generateUnlockSecret, submitUnlockGuess } from "../../core/access-challenges/unlock";
import { getCheckRA } from "../../core/checks/check-roll-analysis";
import { resolveCheckDifficulty } from "../../core/checks/check";
import { NORMAL_DIE_STEPS, type NormalDieStep } from "../../core/dice/die-step";
import { resolveAbilityUseCostPlan } from "../../application/abilities/ability-use-cost-plan";
import { isActiveSession, projectPlayerSession, type AccessChallengeSession, type PlayerProjection } from "../../application/access-challenges/session";
import { validateBreakConfig, validateUnlockConfig, type BreakConfig, type UnlockConfig } from "../../application/access-challenges/configuration";
import { AccessChallengeError } from "../../application/access-challenges/errors";
import type { AgentCheckParticipantReference } from "../../application/checks/agent-check-participant";
import { resolveAgentCheckParticipant } from "../../adapters/foundry/actors/resolve-agent-check-participant";
import { readAgentCheckSource } from "../../adapters/foundry/actors/read-agent-check-source";
import { readAgentCheckAbilities } from "../../adapters/foundry/abilities/read-agent-check-abilities";
import { canUserOperateChallenge } from "../../adapters/foundry/access-challenges/challenge-owners";
import { enqueueActorAbilityCostOperation, payAbilityUseCostPlan } from "../../adapters/foundry/abilities/ability-use-cost-payment";
import { executeFoundryCheck } from "../../adapters/foundry/dice/execute-foundry-check";
import { isRegisteredMessageMode, publishCheckMessage } from "../../adapters/foundry/chat/publish-check-message";
import { isAgentCheckChoices, prepareAgentCheckExecution } from "../checks/resolve-agent-check-interaction";

const sessions = new Map<string, AccessChallengeSession>();
const listeners = new Set<() => void>();
const sessionQueues = new Map<string, Promise<unknown>>();

export function subscribeAccessChallenges(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

function notify(): void { for (const listener of listeners) listener(); }
function save(session: AccessChallengeSession): void { sessions.set(session.id, session); notify(); }

function serializeSession<T>(id: string, operation: () => Promise<T>): Promise<T> {
  const prior = sessionQueues.get(id) ?? Promise.resolve();
  const result = prior.then(operation, operation);
  sessionQueues.set(id, result);
  void result.finally(() => { if (sessionQueues.get(id) === result) sessionQueues.delete(id); }).catch(() => undefined);
  return result;
}

export function activeAccessChallenges(): readonly AccessChallengeSession[] {
  return [...sessions.values()].filter(session => session.gmUserId === game.user.id && isActiveSession(session));
}

export function gmAccessChallenge(id: string): AccessChallengeSession | null {
  const session = sessions.get(id);
  return session?.gmUserId === game.user.id ? session : null;
}

async function validateCreation(participant: AgentCheckParticipantReference): Promise<foundry.documents.Actor> {
  if (!game.user.isGM || game.users.activeGM?.id !== game.user.id) throw new AccessChallengeError("Somente o Mestre ativo pode criar um desafio.");
  const actor = await resolveAgentCheckParticipant(participant);
  if (!actor) throw new AccessChallengeError("O agente participante não está mais disponível.");
  return actor;
}

function randomFace(faces: number): number {
  const values = new Uint32Array(1);
  const limit = Math.floor(0x100000000 / faces) * faces;
  do { crypto.getRandomValues(values); } while (values[0]! >= limit);
  return values[0]! % faces + 1;
}

function commonSession(participant: AgentCheckParticipantReference, actor: foundry.documents.Actor, obstacle: string) {
  return { id: crypto.randomUUID(), gmUserId: game.user.id, participant,
    participantName: actor.name, participantImg: actor.img ?? "icons/svg/mystery-man.svg",
    obstacle: obstacle.trim(), revision: 0 };
}

export async function createUnlockChallenge(config: UnlockConfig): Promise<AccessChallengeSession> {
  validateUnlockConfig(config);
  const actor = await validateCreation(config.participant);
  const crime = readAgentCheckSource(actor).skills.crime;
  if (typeof crime !== "number" || !NORMAL_DIE_STEPS.includes(crime as NormalDieStep)) throw new AccessChallengeError("O agente precisa ter um dado válido em Crime para iniciar o desafio.");
  const secret = config.secretMode === "manual" ? config.manualSecret! : generateUnlockSecret(config.diceCount, config.die, randomFace);
  const session: AccessChallengeSession = { ...commonSession(config.participant, actor, config.obstacle),
    type: "unlock", state: createUnlockState(secret, config.die, config.resistance, crime as NormalDieStep) };
  save(session);
  return session;
}

export async function createBreakChallenge(config: BreakConfig): Promise<AccessChallengeSession> {
  validateBreakConfig(config);
  const actor = await validateCreation(config.participant);
  const session: AccessChallengeSession = { ...commonSession(config.participant, actor, config.obstacle),
    type: "break", difficulty: config.difficulty, state: createBreakState(config.pa) };
  save(session);
  return session;
}

export async function advanceChallengeRound(id: string): Promise<AccessChallengeSession> {
  return serializeSession(id, async () => {
    const session = gmAccessChallenge(id);
    if (!session || session.type !== "unlock") throw new Error("Unlock session is unavailable.");
    const next: AccessChallengeSession = { ...session, state: advanceUnlockRound(session.state), revision: session.revision + 1 };
    save(next);
    return next;
  });
}

export async function cancelAccessChallenge(id: string): Promise<AccessChallengeSession> {
  return serializeSession(id, async () => {
    const session = gmAccessChallenge(id);
    if (!session || !isActiveSession(session)) throw new Error("Active session is unavailable.");
    const next: AccessChallengeSession = session.type === "unlock"
      ? { ...session, state: { ...session.state, status: "cancelled" }, revision: session.revision + 1 }
      : { ...session, state: { ...session.state, status: "cancelled" }, revision: session.revision + 1 };
    save(next);
    return next;
  });
}

export type PlayerAction =
  | { readonly kind: "guess"; readonly id: string; readonly revision: number; readonly guess: readonly number[] }
  | { readonly kind: "break"; readonly id: string; readonly revision: number; readonly choices: unknown; readonly messageMode: string };

export type PlayerActionResult =
  | { readonly status: "ok" | "stale"; readonly projection: PlayerProjection; readonly chatPublished?: boolean }
  | { readonly status: "forbidden" | "invalid" | "unavailable" };

export async function submitPlayerAction(input: PlayerAction, sender: foundry.documents.User): Promise<PlayerActionResult> {
  if (!input || typeof input.id !== "string" || !Number.isInteger(input.revision)) return { status: "invalid" };
  return serializeSession(input.id, async () => {
    const session = gmAccessChallenge(input.id);
    if (!session) return { status: "unavailable" };
    const actor = await resolveAgentCheckParticipant(session.participant);
    if (!actor || !canUserOperateChallenge(actor, sender)) return { status: "forbidden" };
    if (input.revision !== session.revision) return { status: "stale", projection: projectPlayerSession(session) };
    if (!isActiveSession(session)) return { status: "stale", projection: projectPlayerSession(session) };

    if (input.kind === "guess" && session.type === "unlock") {
      if (!Array.isArray(input.guess)) return { status: "invalid" };
      try {
        const next: AccessChallengeSession = { ...session, state: submitUnlockGuess(session.state, input.guess), revision: session.revision + 1 };
        save(next);
        return { status: "ok", projection: projectPlayerSession(next) };
      } catch { return { status: "invalid" }; }
    }

    if (input.kind !== "break" || session.type !== "break" || !isAgentCheckChoices(input.choices)
      || input.choices.difficulty !== session.difficulty || !isRegisteredMessageMode(input.messageMode)) return { status: "invalid" };
    const choices = input.choices;

    try {
      return await enqueueActorAbilityCostOperation(actor, async (): Promise<PlayerActionResult> => {
        const currentActor = await resolveAgentCheckParticipant(session.participant);
        if (!currentActor || !canUserOperateChallenge(currentActor, sender)) return { status: "forbidden" };
        const selection = { kind: "skill" as const, key: "athletics" as const };
        const prepared = prepareAgentCheckExecution(currentActor, selection, choices, sender);
        const sourceBefore = readAgentCheckSource(currentActor);
        const costSource = readAgentCheckAbilities(currentActor);
        const claims = prepared.preparedAbilityUses.applied.map(use => ({ abilityId: use.abilityId, useId: use.useId, cost: use.cost }));
        const balances = { health: costSource.health, determination: costSource.determination,
          abilityResources: Object.fromEntries(costSource.abilities.map(ability => [ability.id, ability.resource?.value ?? null])) };
        const initialPlan = resolveAbilityUseCostPlan(claims, balances, 1);
        if (initialPlan.status !== "success") return { status: "invalid" };
        const execution = await executeFoundryCheck(prepared.effectiveInput);
        if (!canUserOperateChallenge(currentActor, sender)) return { status: "forbidden" };
        const revalidated = prepareAgentCheckExecution(currentActor, selection, choices, sender);
        if (JSON.stringify(sourceBefore) !== JSON.stringify(readAgentCheckSource(currentActor))
          || JSON.stringify(prepared.effectiveInput) !== JSON.stringify(revalidated.effectiveInput)
          || JSON.stringify(prepared.preparedAbilityUses.applied) !== JSON.stringify(revalidated.preparedAbilityUses.applied)) {
          return { status: "invalid" };
        }
        const freshSource = readAgentCheckAbilities(currentActor);
        const freshPlan = resolveAbilityUseCostPlan(claims, { health: freshSource.health,
          determination: freshSource.determination,
          abilityResources: Object.fromEntries(freshSource.abilities.map(ability => [ability.id, ability.resource?.value ?? null])) }, 1);
        if (freshPlan.status !== "success") return { status: "invalid" };
        const difficulty = resolveCheckDifficulty(execution.result.total, session.difficulty);
        const nextState = recordBreakAttempt(session.state, difficulty.outcome, getCheckRA(execution.result));
        await payAbilityUseCostPlan(currentActor, freshPlan.plan);
        const next: AccessChallengeSession = { ...session, state: nextState, revision: session.revision + 1 };
        save(next);
        try {
          await publishCheckMessage(currentActor, execution, difficulty, prepared.preparedAbilityUses.applied, input.messageMode);
          return { status: "ok", projection: projectPlayerSession(next), chatPublished: true };
        } catch (error) {
          console.error("ordemparanormal2 | Access Challenge Check chat publication failed.", error);
          return { status: "ok", projection: projectPlayerSession(next), chatPublished: false };
        }
      });
    } catch (error) {
      console.error("ordemparanormal2 | Break attempt failed before commit.", error);
      return { status: "invalid" };
    }
  });
}
