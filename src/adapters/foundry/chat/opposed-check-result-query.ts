import type { SubmitOpposedCheckResultData } from "../../../features/checks/submit-opposed-check-result";
import {
  parseSubmitOpposedCheckResultData,
  submitOpposedCheckResult,
} from "../../../features/checks/submit-opposed-check-result";
import { SYSTEM_ID } from "../../../config/system-config";

export const OPPOSED_CHECK_RESULT_QUERY = `${SYSTEM_ID}.submitOpposedCheckResult`;

export interface FoundryUserQueryContext {
  readonly timeout?: number;
  readonly user: foundry.documents.User;
}

export type OpposedCheckResultQueryHandler = (
  data: SubmitOpposedCheckResultData,
  context: FoundryUserQueryContext,
) => Promise<void>;

export const opposedCheckResultQueryHandler: OpposedCheckResultQueryHandler = async (
  data,
  context,
) => {
  const parsed = parseSubmitOpposedCheckResultData(data);
  if (!parsed) throw new Error("Invalid Opposed Check query payload.");
  const users = (game as typeof game & {
    readonly users: { get(id: string): foundry.documents.User | undefined };
  }).users;
  const sender = users.get(context.user.id);
  if (!sender) throw new Error("The querying User no longer exists.");
  await submitOpposedCheckResult(parsed, sender);
};

export function registerOpposedCheckResultQuery(): void {
  (CONFIG as typeof CONFIG & { queries: Record<string, unknown> })
    .queries[OPPOSED_CHECK_RESULT_QUERY] = opposedCheckResultQueryHandler;
}

export async function dispatchOpposedCheckResult(
  data: SubmitOpposedCheckResultData,
): Promise<void> {
  const users = (game as typeof game & {
    readonly users: { readonly activeGM: foundry.documents.User | null };
  }).users;
  const activeGM = users.activeGM;
  if (!activeGM) throw new Error("No active GM is available for the Opposed Check.");
  if (activeGM.id === game.user.id) {
    await submitOpposedCheckResult(data, game.user);
    return;
  }
  await activeGM.query(OPPOSED_CHECK_RESULT_QUERY, data);
}
