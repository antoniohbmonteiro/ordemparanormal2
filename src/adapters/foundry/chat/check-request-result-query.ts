import {
  parseSubmitCheckRequestResultData,
  submitCheckRequestResult,
  type SubmitCheckRequestResultData,
} from "../../../features/checks/submit-check-request-result";
import { SYSTEM_ID } from "../../../config/system-config";

interface FoundryUserQueryContext {
  readonly timeout?: number;
  readonly user: foundry.documents.User;
}

export const CHECK_REQUEST_RESULT_QUERY = `${SYSTEM_ID}.submitCheckRequestResult`;

export const checkRequestResultQueryHandler = async (
  data: SubmitCheckRequestResultData,
  context: FoundryUserQueryContext,
): Promise<void> => {
  const parsed = parseSubmitCheckRequestResultData(data);
  if (!parsed) throw new Error("Invalid Check Request query payload.");
  const users = (game as typeof game & {
    readonly users: { get(id: string): foundry.documents.User | undefined };
  }).users;
  const sender = users.get(context.user.id);
  if (!sender) throw new Error("The querying User no longer exists.");
  await submitCheckRequestResult(parsed, sender);
};

export function registerCheckRequestResultQuery(): void {
  (CONFIG as typeof CONFIG & { queries: Record<string, unknown> })
    .queries[CHECK_REQUEST_RESULT_QUERY] = checkRequestResultQueryHandler;
}

export async function dispatchCheckRequestResult(
  data: SubmitCheckRequestResultData,
): Promise<void> {
  const users = (game as typeof game & {
    readonly users: { readonly activeGM: foundry.documents.User | null };
  }).users;
  const activeGM = users.activeGM;
  if (!activeGM) throw new Error("No active GM is available for the Check Request.");
  if (activeGM.id === game.user.id) {
    await submitCheckRequestResult(data, game.user);
    return;
  }
  await activeGM.query(CHECK_REQUEST_RESULT_QUERY, data);
}
