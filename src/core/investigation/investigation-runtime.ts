export interface InvestigationRuntime {
  readonly schemaVersion: 1;
  readonly runId: string;
  readonly round: number;
  readonly actedAgentUuids: readonly string[];
  readonly recapSuccessActorUuid?: string;
  readonly shareSuccessActorUuid?: string;
  readonly shareSuccessMessageId?: string;
  readonly shareCluePending?: boolean;
  readonly shareClueGrant?: InvestigationShareClueGrant;
}

export type InvestigationShareClueGrant = {
  readonly kind: "existing" | "new";
  readonly clueId: string;
  readonly recipientActorUuids: readonly string[];
  readonly text?: string;
};

const actorUuid = (value: unknown): value is string =>
  typeof value === "string" && /^Actor\.[^.]+$/u.test(value);

function readShareClueGrant(value: unknown): InvestigationShareClueGrant | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const data = value as Record<string, unknown>;
  if ((data.kind !== "existing" && data.kind !== "new") || typeof data.clueId !== "string" || !data.clueId.trim()
    || !Array.isArray(data.recipientActorUuids) || !data.recipientActorUuids.length
    || !data.recipientActorUuids.every(actorUuid)
    || data.kind === "new" && (typeof data.text !== "string" || !data.text.trim())) return null;
  return { kind: data.kind, clueId: data.clueId,
    recipientActorUuids: [...new Set(data.recipientActorUuids as string[])],
    ...(data.kind === "new" ? { text: (data.text as string).trim() } : {}) };
}

export function readInvestigationRuntime(value: unknown): InvestigationRuntime | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const data = value as Record<string, unknown>;
  if (data.schemaVersion !== 1 || typeof data.runId !== "string" || !data.runId.trim()
    || !Number.isSafeInteger(data.round) || (data.round as number) < 1
    || !Array.isArray(data.actedAgentUuids) || !data.actedAgentUuids.every(actorUuid)
    || (data.recapSuccessActorUuid !== undefined && !actorUuid(data.recapSuccessActorUuid))
    || (data.shareSuccessActorUuid !== undefined && !actorUuid(data.shareSuccessActorUuid))
    || (data.shareSuccessMessageId !== undefined && (typeof data.shareSuccessMessageId !== "string" || !data.shareSuccessMessageId.trim()))
    || (data.shareCluePending !== undefined && typeof data.shareCluePending !== "boolean")
    || (data.shareCluePending === true && !actorUuid(data.shareSuccessActorUuid))
    || (data.shareClueGrant !== undefined && (!actorUuid(data.shareSuccessActorUuid) || !readShareClueGrant(data.shareClueGrant)))) return null;
  const grant = readShareClueGrant(data.shareClueGrant);
  return {
    schemaVersion: 1,
    runId: data.runId,
    round: data.round as number,
    actedAgentUuids: [...new Set(data.actedAgentUuids as string[])],
    ...(actorUuid(data.recapSuccessActorUuid) ? { recapSuccessActorUuid: data.recapSuccessActorUuid } : {}),
    ...(actorUuid(data.shareSuccessActorUuid) ? { shareSuccessActorUuid: data.shareSuccessActorUuid } : {}),
    ...(typeof data.shareSuccessMessageId === "string" ? { shareSuccessMessageId: data.shareSuccessMessageId } : {}),
    ...(typeof data.shareCluePending === "boolean" ? { shareCluePending: data.shareCluePending } : {}),
    ...(grant ? { shareClueGrant: grant } : {}),
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
