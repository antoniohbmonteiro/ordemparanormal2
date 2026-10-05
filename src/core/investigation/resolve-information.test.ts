import { describe, expect, it } from "vitest";
import { hasPendingManualToolInformation, reachableInformationIds, type InvestigableInformation } from "./resolve-information";
import { resolveExamination } from "../../features/points-of-interest/resolve-examination";

const information: InvestigableInformation[] = [
  { id: "low", availability: { mode: "always" }, approaches: [{ skill: "research", difficulty: 6 }] },
  { id: "high", availability: { mode: "always" }, approaches: [{ skill: "research", difficulty: 10 }] },
  { id: "situational", availability: { mode: "situational" }, approaches: [{ skill: "research", difficulty: 4 }] },
  { id: "aptitude", availability: { mode: "always" }, approaches: [{ skill: "aptitude", specialization: "arts", difficulty: 8 }] },
];

describe("investigation information resolution", () => {
  it.each([undefined, { type: "laboratory" as const, sequenceLength: 4 as const },
    { type: "radio" as const, trueFragments: ["Mensagem"], falseFragments: ["Ruído"] }])(
    "requires an unknown compatible situational answer for manual resolution with config %j", config => {
      const approach = { type: "tool" as const, equipmentUuid: "Item.source", useFormId: "use", ...(config ? { mechanicConfig: config } : {}) };
      const entries: InvestigableInformation[] = [
        { id: "automatic", availability: { mode: "always" }, approaches: [approach] },
        { id: "manual", availability: { mode: "situational" }, approaches: [approach] },
      ];
      expect(hasPendingManualToolInformation(entries, new Set(["automatic"]), "Item.source", "use", config)).toBe(true);
      expect(hasPendingManualToolInformation(entries, new Set(["automatic", "manual"]), "Item.source", "use", config)).toBe(false);
      expect(hasPendingManualToolInformation(entries.slice(0, 1), new Set(["automatic"]), "Item.source", "use", config)).toBe(false);
      expect(hasPendingManualToolInformation(entries, new Set<string>(), "Item.other", "use", config)).toBe(false);
      expect(hasPendingManualToolInformation(entries, new Set<string>(), "Item.source", "other", config)).toBe(false);
      const differentConfig = config?.type === "laboratory" ? { ...config, sequenceLength: 5 as const }
        : config?.type === "radio" ? { ...config, falseFragments: [] } : { type: "laboratory" as const, sequenceLength: 4 as const };
      expect(hasPendingManualToolInformation(entries, new Set<string>(), "Item.source", "use", differentConfig)).toBe(false);
    });
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
