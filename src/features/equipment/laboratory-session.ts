import type { LaboratoryCommand, LaboratoryResponse, LaboratoryView } from "../../application/equipment/laboratory-session";
import { LABORATORY_QUERY, resolveLaboratoryCommand } from "../../adapters/foundry/equipment/laboratory-session";
import type { EquipmentUseResult } from "../../adapters/foundry/equipment/execute-equipment-use";

export interface LaboratoryController {
  readonly initial: LaboratoryView;
  command(action: LaboratoryCommand["action"], positions?: readonly number[]): Promise<LaboratoryResponse>;
  cancel(): Promise<LaboratoryResponse>;
}
export interface LaboratoryWindow { render(options: { force: boolean }): Promise<unknown>; close(): Promise<unknown> }
export async function runLaboratorySession(initial: LaboratoryView, authorityId: string,
  stillSelected: () => boolean, signal?: AbortSignal,
  create?: (controller: LaboratoryController) => LaboratoryWindow): Promise<EquipmentUseResult> {
  let current = initial;
  let pending: LaboratoryCommand | undefined = initial.pendingCommand;
  let settled = false;
  let settle!: (result: EquipmentUseResult) => void;
  const completed = new Promise<EquipmentUseResult>(resolve => { settle = resolve; });
  const done = (result: EquipmentUseResult) => { if (!settled) { settled = true; settle(result); } };
  const dispatch = async (input: LaboratoryCommand): Promise<LaboratoryResponse> => {
    const gm = game.users.activeGM;
    if (!gm || gm.id !== authorityId) return { status: "uncertain" };
    return gm.id === game.user.id ? resolveLaboratoryCommand(input, game.user)
      : await gm.query(LABORATORY_QUERY, input, { timeout: 10000 }) as LaboratoryResponse;
  };
  const command = async (action: LaboratoryCommand["action"], positions?: readonly number[]): Promise<LaboratoryResponse> => {
    if (action !== "cancel" && action !== "get" && !stillSelected()) return controller.cancel();
    // A failed transport or partial step is retried with the original command and parameters.
    const input = pending ?? { sessionId: current.sessionId, commandId: crypto.randomUUID(), revision: current.revision,
      action, ...(positions ? { positions: [...positions] } : {}) };
    if (action !== "cancel" && action !== "get") pending = input;
    let result: LaboratoryResponse;
    try { result = await dispatch(input); } catch { return { status: "uncertain" }; }
    if (result.status !== "partial" && result.status !== "uncertain") pending = undefined;
    if (result.status === "laboratory") {
      current = result.view;
      if (result.terminal) done(result.terminal);
    } else if (!["partial", "uncertain", "busy"].includes(result.status)) done(result);
    return result;
  };
  const controller: LaboratoryController = { initial,
    command,
    cancel: async () => {
      // Resolve any response lost in transit before choosing the cancellation revision.
      let queried: LaboratoryResponse;
      try { queried = await dispatch({ sessionId: current.sessionId, commandId: crypto.randomUUID(), revision: current.revision, action: "get" }); }
      catch { queried = { status: "uncertain" }; }
      if (queried.status !== "laboratory") { done(queried); return queried; }
      current = queried.view;
      if (queried.terminal) { done(queried.terminal); return queried; }
      let result: LaboratoryResponse;
      try { result = await dispatch({ sessionId: current.sessionId, commandId: crypto.randomUUID(), revision: current.revision, action: "cancel" }); }
      catch { result = { status: "uncertain" }; }
      if (result.status === "laboratory") { current = result.view; done(result.terminal ?? { status: "cancelled" }); }
      else done(result);
      return result;
    },
  };
  // Loading the application lazily also keeps Foundry presentation out of standard Equipment callers.
  const window = create ? create(controller) : new (await import("../../applications/equipment/laboratory-application")).LaboratoryApplication(controller);
  const abort = () => { void controller.cancel().finally(() => window.close()); };
  signal?.addEventListener("abort", abort, { once: true });
  try {
    if (signal?.aborted || !stillSelected()) await controller.cancel();
    else await window.render({ force: true });
    return await completed;
  } catch {
    await controller.cancel();
    return { status: "uncertain" };
  } finally { signal?.removeEventListener("abort", abort); }
}
