export interface InvestigableInformation {
  readonly id: string;
  readonly availability: { readonly mode: "always" | "situational" };
  readonly approaches: readonly {
    readonly skill: string;
    readonly specialization?: string;
    readonly difficulty: number;
  }[];
}

export function reachableInformationIds(
  information: readonly InvestigableInformation[],
  knownIds: ReadonlySet<string>,
  skill: string,
  specialization: string | undefined,
  value: number,
): readonly string[] {
  return information.filter(entry => entry.availability.mode === "always" && !knownIds.has(entry.id)
    && entry.approaches.some(approach => approach.skill === skill
      && (skill !== "aptitude" || approach.specialization === specialization)
      && value >= approach.difficulty)).map(entry => entry.id);
}
