import { reachableInformationIds, type InvestigableInformation } from "../../core/investigation/resolve-information";

export interface ExaminationResolution {
  readonly newInformationIds: readonly string[];
  readonly losesDetermination: boolean;
}

export function resolveExamination(
  information: readonly InvestigableInformation[],
  knownIds: ReadonlySet<string>,
  skill: string,
  specialization: string | undefined,
  total: number,
): ExaminationResolution {
  const newInformationIds = reachableInformationIds(information, knownIds, skill, specialization, total);
  return { newInformationIds, losesDetermination: newInformationIds.length === 0 };
}
