import type { LaboratoryDie } from "../../core/equipment/laboratory-challenge";

export interface LaboratorySnapshot {
  readonly schemaVersion: 1;
  readonly equipmentName: string;
  readonly formName: string;
  readonly actorName: string;
  readonly mind: number;
  readonly ceiling: LaboratoryDie;
  readonly dice: readonly LaboratoryDie[];
  readonly initial: readonly number[];
  readonly rerolls: readonly { readonly positions: readonly number[]; readonly results: readonly number[];
    readonly completed: boolean }[];
  readonly results: readonly number[];
  readonly remaining: number;
  readonly outcome: "success" | "failure" | "cancelled" | "invalidated";
  readonly newCount: number;
  readonly rolls: readonly ReturnType<Roll["toJSON"]>[];
}
