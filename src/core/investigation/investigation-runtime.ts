export interface InvestigationRuntime {
  readonly schemaVersion: 1;
  readonly runId: string;
  readonly round: number;
  readonly actedAgentUuids: readonly string[];
  readonly recapSuccessActorUuid?: string;
  readonly shareSuccessActorUuid?: string;
}

const actorUuid = (value: unknown): value is string =>
  typeof value === "string" && /^Actor\.[^.]+$/u.test(value);

export function readInvestigationRuntime(value: unknown): InvestigationRuntime | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const data = value as Record<string, unknown>;
  if (data.schemaVersion !== 1 || typeof data.runId !== "string" || !data.runId.trim()
    || !Number.isSafeInteger(data.round) || (data.round as number) < 1
    || !Array.isArray(data.actedAgentUuids) || !data.actedAgentUuids.every(actorUuid)
    || (data.recapSuccessActorUuid !== undefined && !actorUuid(data.recapSuccessActorUuid))
    || (data.shareSuccessActorUuid !== undefined && !actorUuid(data.shareSuccessActorUuid))) return null;
  return {
    schemaVersion: 1,
    runId: data.runId,
    round: data.round as number,
    actedAgentUuids: [...new Set(data.actedAgentUuids as string[])],
    ...(actorUuid(data.recapSuccessActorUuid) ? { recapSuccessActorUuid: data.recapSuccessActorUuid } : {}),
    ...(actorUuid(data.shareSuccessActorUuid) ? { shareSuccessActorUuid: data.shareSuccessActorUuid } : {}),
  };
}

export function startInvestigation(runId: string): InvestigationRuntime {
  if (!runId.trim()) throw new Error("Investigation run ID is required.");
  return { schemaVersion: 1, runId, round: 1, actedAgentUuids: [] };
}

export function advanceInvestigationRound(runtime: InvestigationRuntime): InvestigationRuntime {
  if (runtime.round >= Number.MAX_SAFE_INTEGER) throw new Error("Investigation round limit reached.");
  return { ...runtime, round: runtime.round + 1, actedAgentUuids: [] };
}

export function setAgentActed(runtime: InvestigationRuntime, uuid: string, acted: boolean): InvestigationRuntime {
  if (!actorUuid(uuid)) throw new Error("Invalid Agent UUID.");
  const next = runtime.actedAgentUuids.filter(value => value !== uuid);
  if (acted) next.push(uuid);
  return { ...runtime, actedAgentUuids: next };
}
