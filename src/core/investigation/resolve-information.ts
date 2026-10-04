export type InvestigationApproach = {
  readonly type?: never;
  readonly skill: string;
  readonly specialization?: string;
  readonly difficulty: number;
} | { readonly type: "tool"; readonly equipmentUuid: string; readonly useFormId: string };
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
  equipmentUuid: string, useFormId: string): readonly string[] {
  return [...new Set(information.filter(entry => entry.availability.mode === "always" && !knownIds.has(entry.id)
    && entry.approaches.some(approach => approach.type === "tool" && approach.equipmentUuid === equipmentUuid
      && approach.useFormId === useFormId)).map(entry => entry.id))];
}
