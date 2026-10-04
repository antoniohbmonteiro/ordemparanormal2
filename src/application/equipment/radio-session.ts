import type { RadioPiece } from "../../core/equipment/radio-puzzle";
import type { AgentCheckChoices } from "../checks/build-agent-check";
import type { EquipmentUseIntent, EquipmentUseResult } from "../../adapters/foundry/equipment/execute-equipment-use";
import type { PoiToolContext } from "../../adapters/foundry/points-of-interest/poi-tool-context";

export interface RadioView {
  readonly sessionId: string;
  readonly revision: number;
  readonly equipmentName: string;
  readonly formName: string;
  readonly state: "prepared" | "active" | "success" | "failure" | "cancelled" | "invalidated";
  readonly removedCount: number;
  readonly active: readonly RadioPiece[];
  readonly discarded: readonly RadioPiece[];
  readonly pendingCommand?: RadioCommand;
}
export interface RadioCommand {
  readonly sessionId: string;
  readonly commandId: string;
  readonly revision: number;
  readonly action: "start" | "move" | "discard" | "restore" | "finish" | "cancel" | "get";
  readonly pieceId?: string;
  readonly direction?: -1 | 1;
  readonly choices?: AgentCheckChoices;
  readonly messageMode?: string;
}
export interface RadioResumeIntent extends EquipmentUseIntent { readonly context: PoiToolContext }
export type RadioResponse = { readonly status: "radio"; readonly view: RadioView; readonly terminal?: EquipmentUseResult } | EquipmentUseResult;
