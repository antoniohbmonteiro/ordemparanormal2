import { describe, expect, it } from "vitest";
import { reachableInformationIds, type InvestigableInformation } from "./resolve-information";
import { resolveExamination } from "../../features/points-of-interest/resolve-examination";

const information: InvestigableInformation[] = [
  { id: "low", availability: { mode: "always" }, approaches: [{ skill: "research", difficulty: 6 }] },
  { id: "high", availability: { mode: "always" }, approaches: [{ skill: "research", difficulty: 10 }] },
  { id: "situational", availability: { mode: "situational" }, approaches: [{ skill: "research", difficulty: 4 }] },
  { id: "aptitude", availability: { mode: "always" }, approaches: [{ skill: "aptitude", specialization: "arts", difficulty: 8 }] },
];

describe("investigation information resolution", () => {
  it("grants every reachable permanent information without interpreting situational conditions", () => {
    expect(reachableInformationIds(information, new Set<string>(), "research", undefined, 10)).toEqual(["low", "high"]);
    expect(reachableInformationIds(information, new Set(["low"]), "research", undefined, 8)).toEqual([]);
  });

  it("uses the selected Aptidão specialization and the resolved Check total", () => {
    expect(resolveExamination(information, new Set<string>(), "aptitude", "arts", 8)).toEqual({
      newInformationIds: ["aptitude"], losesDetermination: false,
    });
    expect(resolveExamination(information, new Set<string>(), "aptitude", "humanities", 20)).toEqual({
      newInformationIds: [], losesDetermination: true,
    });
  });
});
