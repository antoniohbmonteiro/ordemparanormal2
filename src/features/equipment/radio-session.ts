import type { RadioCommand, RadioResponse, RadioView } from "../../application/equipment/radio-session";
import { RADIO_QUERY, resolveRadioCommand } from "../../adapters/foundry/equipment/radio-session";
import type { EquipmentUseResult } from "../../adapters/foundry/equipment/execute-equipment-use";
import { prepareAgentCheckInteraction } from "../checks/resolve-agent-check-interaction";
import { getCurrentMessageMode } from "../../adapters/foundry/chat/publish-check-message";

export interface RadioController {
  readonly initial: RadioView;
  command(action: RadioCommand["action"], pieceId?: string, direction?: -1 | 1): Promise<RadioResponse>;
  cancel(): Promise<RadioResponse>;
}
export interface RadioWindow { render(options: { force: boolean }): Promise<unknown>; close(): Promise<unknown> }
export async function runRadioSession(actor: foundry.documents.Actor, initial: RadioView, authorityId: string,
  stillSelected: () => boolean, signal?: AbortSignal, create?: (controller: RadioController) => RadioWindow): Promise<EquipmentUseResult> {
  let current = initial, pending = initial.pendingCommand;
  let settled = false;
  let cancelling: Promise<RadioResponse> | undefined;
  let cancelInput: RadioCommand | undefined;
  let settle!: (result: EquipmentUseResult) => void;
  const completed = new Promise<EquipmentUseResult>(resolve => { settle = resolve; });
  const done = (result: EquipmentUseResult) => { if (!settled) { settled = true; settle(result); } };
  const localAbort = new AbortController();
  const dispatch = async (input: RadioCommand): Promise<RadioResponse> => {
    const gm = game.users.activeGM;
    if (!gm || gm.id !== authorityId) return { status: "uncertain" };
    return gm.id === game.user.id ? resolveRadioCommand(input, game.user)
      : await gm.query(RADIO_QUERY, input, { timeout: 10000 }) as RadioResponse;
  };
  const controller: RadioController = { initial,
    command: async (action, pieceId, direction) => {
      if (!["cancel", "get"].includes(action) && (!stillSelected() || localAbort.signal.aborted)) return controller.cancel();
      let input = pending;
      if (!input) {
        input = { sessionId: current.sessionId, commandId: crypto.randomUUID(), revision: current.revision, action,
          ...(pieceId ? { pieceId } : {}), ...(direction ? { direction } : {}) };
        if (action === "start") {
          const choices = await prepareAgentCheckInteraction(actor, { kind: "skill", key: "technology" },
            { allowDifficulty: false, signal: localAbort.signal });
          if (!choices || !stillSelected() || localAbort.signal.aborted) return controller.cancel();
          input = { ...input, choices, messageMode: getCurrentMessageMode() };
        }
      }
      if (!["get", "cancel"].includes(action)) pending = input;
      let result: RadioResponse;
      try { result = await dispatch(input); } catch { return { status: "uncertain" }; }
      if (!["partial", "uncertain"].includes(result.status)) pending = undefined;
      if (result.status === "radio") { current = result.view; if (result.terminal) done(result.terminal); }
      else if (!["partial", "uncertain", "busy"].includes(result.status)) done(result);
      return result;
    },
    cancel: () => {
      if (cancelling) return cancelling;
      cancelling = Promise.resolve().then(async (): Promise<RadioResponse> => {
        localAbort.abort();
        if (!cancelInput) {
          let queried: RadioResponse;
          try { queried = await dispatch({ sessionId: current.sessionId, commandId: crypto.randomUUID(), revision: current.revision, action: "get" }); }
          catch { queried = { status: "uncertain" }; }
          if (queried.status !== "radio") { done(queried); return queried; }
          current = queried.view;
          if (queried.terminal) { done(queried.terminal); return queried; }
          cancelInput = { sessionId: current.sessionId, commandId: crypto.randomUUID(), revision: current.revision, action: "cancel" };
        }
        let result: RadioResponse;
        try { result = await dispatch(cancelInput); }
        catch { result = { status: "uncertain" }; }
        if (result.status === "radio") { current = result.view; done(result.terminal ?? { status: "cancelled" }); }
        else done(result);
        if (["partial", "uncertain"].includes(result.status)) cancelling = undefined;
        return result;
      });
      return cancelling;
    },
  };
  const window = create ? create(controller) : new (await import("../../applications/equipment/radio-application")).RadioApplication(controller);
  const abort = () => { localAbort.abort(); void controller.cancel().finally(() => window.close()); };
  signal?.addEventListener("abort", abort, { once: true });
  try {
    if (signal?.aborted || !stillSelected()) await controller.cancel();
    else await window.render({ force: true });
    return await completed;
  } catch { await controller.cancel(); return { status: "uncertain" }; }
  finally { signal?.removeEventListener("abort", abort); }
}
