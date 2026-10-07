import type { AccessChallengeSession, PlayerProjection } from "../../application/access-challenges/session";
import type { UnlockFeedback } from "../../core/access-challenges/unlock";
import { remainingBreakResistance } from "../../core/access-challenges/break";

const feedbackPresentation = {
  low: { feedbackLabel: "ORDEMPARANORMAL2.AccessChallenges.Feedback.Low", feedbackSymbol: "▼" },
  exact: { feedbackLabel: "ORDEMPARANORMAL2.AccessChallenges.Feedback.Exact", feedbackSymbol: "✓" },
  high: { feedbackLabel: "ORDEMPARANORMAL2.AccessChallenges.Feedback.High", feedbackSymbol: "▲" },
} as const;

export function buildPlayerChallengeContext(projection: PlayerProjection, draft: readonly number[], busy: boolean, error: string, chatWarning: string,
  localize: (key: string) => string) {
  const common = { participantName: projection.participantName, participantImg: projection.participantImg,
    obstacle: projection.obstacle, busy, error, chatWarning, status: projection.status,
    challengeType: projection.type, isUnlock: projection.type === "unlock", isBreak: projection.type === "break",
    succeeded: projection.status === "success" || projection.status === "completed", jammed: projection.status === "jammed" };
  if (projection.type === "unlock") {
    const roundLimit = projection.status === "active" && projection.attemptsThisRound === projection.attemptsPerRound;
    const blocked = projection.status !== "active" || roundLimit;
    return { ...common, wide: projection.diceCount > 3, unlock: { die: projection.die, round: projection.round,
      roundLabel: localize(projection.round === 1 ? "ORDEMPARANORMAL2.AccessChallenges.Unlock.RoundSingular"
        : "ORDEMPARANORMAL2.AccessChallenges.Unlock.RoundPlural"),
      dieIcon: projection.die === 6 ? "systems/ordemparanormal2/assets/icons/access-challenges/d6.svg"
        : `systems/ordemparanormal2/assets/icons/dice/d${projection.die}.svg`,
      attemptsPerRound: projection.attemptsPerRound, attemptsThisRound: projection.attemptsThisRound,
      attemptsUsed: projection.attemptsUsed, resistance: projection.resistance, canAct: !blocked && !busy
        && draft.length === projection.diceCount && draft.every(value => Number.isInteger(value) && value >= 1 && value <= projection.die),
      roundLimit, success: projection.status === "success", jammed: projection.status === "jammed",
      cancelled: projection.status === "cancelled", terminal: projection.status !== "active",
      slots: Array.from({ length: projection.diceCount }, (_, index) => {
        const value = draft[index] ?? projection.latest?.guess[index] ?? 0;
        const feedback = projection.latest?.feedback[index];
        return { index, label: index + 1, value: value || "—", feedback: feedback ?? "",
          ...(feedback ? { ...feedbackPresentation[feedback], feedbackLabel: localize(feedbackPresentation[feedback].feedbackLabel) }
            : { feedbackLabel: "", feedbackSymbol: "" }), disabled: blocked || busy,
          showChevron: projection.status === "active", options: Array.from({ length: projection.die }, (_, option) => ({ value: option + 1, selected: option + 1 === value })) };
      }) } };
  }
  return { ...common, wide: false, break: { obstacle: projection.obstacle, difficulty: projection.difficulty,
    pa: projection.pa, remaining: projection.remaining,
    percentage: Math.max(0, Math.min(100, 100 * projection.remaining / projection.pa)),
    canAct: projection.status === "active" && !busy, completed: projection.status === "completed",
    cancelled: projection.status === "cancelled", failed: projection.status === "active" && projection.latest?.outcome === "failure",
    progressed: projection.status === "active" && projection.latest?.outcome === "success", latestRA: projection.latest?.addedRA ?? 0 } };
}

export function buildGmChallengeContext(session: AccessChallengeSession, busy: boolean, localize: (key: string) => string) {
  const common = { participantName: session.participantName, participantImg: session.participantImg,
    obstacle: session.obstacle, challengeType: session.type, status: session.state.status,
    isUnlock: session.type === "unlock", isBreak: session.type === "break", busy,
    terminal: session.state.status !== "active", canCancel: session.state.status === "active" };
  if (session.type === "unlock") {
    const state = session.state;
    return { ...common, wide: state.secret.length > 3, unlock: { crimeDie: state.crimeDie, secret: state.secret, nextRound: state.round + 1,
      attemptsThisRound: state.attemptsThisRound, attemptsPerRound: state.attemptsPerRound,
      attemptsUsed: state.attemptsUsed, resistance: state.resistance, round: state.round,
      canAdvance: state.status === "active" && state.attemptsThisRound === state.attemptsPerRound && state.attemptsUsed < state.resistance,
      success: state.status === "success", jammed: state.status === "jammed",
      history: state.history.map(attempt => ({ ...attempt, slots: attempt.guess.map((value, index) => {
        const feedback: UnlockFeedback = attempt.feedback[index]!;
        return { value, feedback, ...feedbackPresentation[feedback], feedbackLabel: localize(feedbackPresentation[feedback].feedbackLabel) };
      }) })) } };
  }
  const state = session.state;
  const remaining = remainingBreakResistance(state);
  return { ...common, wide: false, break: { difficulty: session.difficulty, pa: state.pa, remaining,
    percentage: Math.max(0, Math.min(100, 100 * remaining / state.pa)), completed: state.status === "completed",
    history: state.history.map(attempt => ({ ...attempt, success: attempt.outcome === "success",
      percentage: Math.max(0, Math.min(100, 100 * attempt.remaining / state.pa)) })) } };
}
