import type { AgentCheckParticipantReference } from "../checks/agent-check-participant";
import type { NormalDieStep } from "../../core/dice/die-step";
import type { UnlockAttempt, UnlockState } from "../../core/access-challenges/unlock";
import type { BreakAttempt, BreakState } from "../../core/access-challenges/break";
import { remainingBreakResistance } from "../../core/access-challenges/break";

interface SessionBase {
  readonly id: string;
  readonly gmUserId: string;
  readonly participant: AgentCheckParticipantReference;
  readonly participantName: string;
  readonly participantImg: string;
  readonly obstacle: string;
  readonly revision: number;
}

export type AccessChallengeSession =
  | (SessionBase & { readonly type: "unlock"; readonly state: UnlockState })
  | (SessionBase & { readonly type: "break"; readonly difficulty: number; readonly state: BreakState });

interface PublicBase {
  readonly id: string;
  readonly gmUserId: string;
  readonly participant: AgentCheckParticipantReference;
  readonly participantName: string;
  readonly participantImg: string;
  readonly obstacle: string;
  readonly revision: number;
}

export type PlayerProjection =
  | (PublicBase & { readonly type: "unlock"; readonly die: NormalDieStep; readonly diceCount: number;
      readonly resistance: number; readonly crimeDie: NormalDieStep; readonly attemptsPerRound: number;
      readonly round: number; readonly attemptsThisRound: number; readonly attemptsUsed: number;
      readonly status: UnlockState["status"]; readonly latest: UnlockAttempt | null })
  | (PublicBase & { readonly type: "break"; readonly difficulty: number; readonly pa: number;
      readonly remaining: number;
      readonly status: BreakState["status"]; readonly latest: BreakAttempt | null });

export function projectPlayerSession(session: AccessChallengeSession): PlayerProjection {
  const base: PublicBase = { id: session.id, gmUserId: session.gmUserId,
    participant: session.participant, participantName: session.participantName,
    participantImg: session.participantImg, obstacle: session.obstacle, revision: session.revision };
  if (session.type === "unlock") {
    const state = session.state;
    return { ...base, type: "unlock", die: state.die, diceCount: state.secret.length, resistance: state.resistance,
      crimeDie: state.crimeDie, attemptsPerRound: state.attemptsPerRound, round: state.round,
      attemptsThisRound: state.attemptsThisRound, attemptsUsed: state.attemptsUsed,
      status: state.status, latest: state.history.at(-1) ?? null };
  }
  return { ...base, type: "break", participant: session.participant, difficulty: session.difficulty, pa: session.state.pa,
    remaining: remainingBreakResistance(session.state), status: session.state.status,
    latest: session.state.history.at(-1) ?? null };
}

export function isActiveSession(session: AccessChallengeSession): boolean {
  return session.state.status === "active";
}
