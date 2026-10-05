import type { LaboratoryDie } from "../../core/equipment/laboratory-challenge";
import type { EquipmentUseResult } from "../../adapters/foundry/equipment/execute-equipment-use";

export interface LaboratoryView {
  readonly sessionId: string;
  readonly revision: number;
  readonly equipmentName: string;
  readonly formName: string;
  readonly state: "prepared" | "active" | "success" | "failure" | "cancelled" | "invalidated";
  readonly dice: readonly LaboratoryDie[];
  readonly results: readonly number[];
  readonly remaining: number;
  readonly ceiling: LaboratoryDie | null;
  readonly pendingCommand?: LaboratoryCommand;
}
export interface LaboratoryCommand {
  readonly sessionId: string;
  readonly commandId: string;
  readonly revision: number;
  readonly action: "start" | "reroll" | "finish" | "cancel" | "get";
  readonly positions?: readonly number[];
}
export type LaboratoryResponse = { readonly status: "laboratory"; readonly view: LaboratoryView;
  readonly terminal?: EquipmentUseResult } | EquipmentUseResult;
