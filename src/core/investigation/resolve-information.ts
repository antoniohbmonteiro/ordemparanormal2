import type { RadioPuzzleConfig } from "../equipment/radio-puzzle";
export type InvestigationApproach = {
  readonly type?: never;
  readonly skill: string;
  readonly specialization?: string;
  readonly difficulty: number;
} | { readonly type: "tool"; readonly equipmentUuid: string; readonly useFormId: string;
  readonly mechanicConfig?: { readonly type: "laboratory"; readonly sequenceLength: 4 | 5 | 6 } | RadioPuzzleConfig };
export interface InvestigableInformation {
  readonly id: string;
  readonly availability: { readonly mode: "always" | "situational" };
  readonly approaches: readonly InvestigationApproach[];
}

export function reachableInformationIds(
  information: readonly InvestigableInformation[],
  knownIds: ReadonlySet<string>,
  skill: string,
  specialization: string | undefined,
  value: number,
): readonly string[] {
  return information.filter(entry => entry.availability.mode === "always" && !knownIds.has(entry.id)
    && entry.approaches.some(approach => approach.type !== "tool" && approach.skill === skill
      && (skill !== "aptitude" || approach.specialization === specialization)
      && value >= approach.difficulty)).map(entry => entry.id);
}

export function toolInformationIds(information: readonly InvestigableInformation[], knownIds: ReadonlySet<string>,
  equipmentUuid: string, useFormId: string, laboratoryLength?: 4 | 5 | 6): readonly string[] {
  return [...new Set(information.filter(entry => entry.availability.mode === "always" && !knownIds.has(entry.id)
    && entry.approaches.some(approach => approach.type === "tool" && approach.equipmentUuid === equipmentUuid
      && approach.useFormId === useFormId && (laboratoryLength === undefined
        ? approach.mechanicConfig === undefined
        : approach.mechanicConfig?.type === "laboratory" && approach.mechanicConfig.sequenceLength === laboratoryLength))).map(entry => entry.id))];
}

export function radioInformationIds(information: readonly InvestigableInformation[], knownIds: ReadonlySet<string>,
  equipmentUuid: string, useFormId: string, config: RadioPuzzleConfig): readonly string[] {
  const signature = (value: RadioPuzzleConfig) => JSON.stringify([value.trueFragments.map(text => text.trim()), value.falseFragments.map(text => text.trim())]);
  return [...new Set(information.filter(entry => entry.availability.mode === "always" && !knownIds.has(entry.id)
    && entry.approaches.some(approach => approach.type === "tool" && approach.equipmentUuid === equipmentUuid
      && approach.useFormId === useFormId && approach.mechanicConfig?.type === "radio"
      && signature(approach.mechanicConfig) === signature(config))).map(entry => entry.id))];
}
