import { canUserRollActor } from "../actors/agent-check-permission";

export type InvestigationAgentResolution =
  | { readonly ok: true; readonly actor: foundry.documents.Actor }
  | { readonly ok: false; readonly reason: "multiple" | "none" };

interface ControlledTokenCandidate {
  readonly actor?: foundry.documents.Actor | null;
}

function controlledTokenCandidates(): readonly ControlledTokenCandidate[] {
  return (globalThis as typeof globalThis & {
    readonly canvas?: {
      readonly tokens?: { readonly controlled: readonly ControlledTokenCandidate[] };
    };
  }).canvas?.tokens?.controlled ?? [];
}

function isRollableAgent(
  actor: foundry.documents.Actor | null | undefined,
  user: foundry.documents.User,
): actor is foundry.documents.Actor {
  return actor?.type === "agent" && canUserRollActor(actor, user);
}

/** Resolves the player's check Actor without choosing arbitrarily. */
export function resolveInvestigationAgent(
  controlledTokens: readonly ControlledTokenCandidate[] =
    controlledTokenCandidates(),
  user: foundry.documents.User = game.user,
): InvestigationAgentResolution {
  const controlledAgents = [
    ...new Set(
      controlledTokens
        .map(({ actor }) => actor)
        .filter((actor): actor is foundry.documents.Actor =>
          isRollableAgent(actor, user)),
    ),
  ];

  if (controlledAgents.length > 1) return { ok: false, reason: "multiple" };
  if (controlledAgents.length === 1) {
    return { ok: true, actor: controlledAgents[0] };
  }

  const character = user.character as foundry.documents.Actor | null;
  return isRollableAgent(character, user)
    ? { ok: true, actor: character }
    : { ok: false, reason: "none" };
}
