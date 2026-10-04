import { expect, it } from "vitest";
import { reachableInformationIds, toolInformationIds, type InvestigableInformation } from "./resolve-information";

const tool = { type: "tool" as const, equipmentUuid: "Item.source", useFormId: "scan" };
const skill = { skill: "perception", difficulty: 6 };
const information: InvestigableInformation[] = [
  { id: "only", availability: { mode: "always" }, approaches: [tool] },
  { id: "mixed", availability: { mode: "always" }, approaches: [tool, skill] },
  { id: "conditional", availability: { mode: "situational" }, approaches: [tool] },
  { id: "other-form", availability: { mode: "always" }, approaches: [{ ...tool, useFormId: "observe" }] },
  { id: "other-source", availability: { mode: "always" }, approaches: [{ ...tool, equipmentUuid: "Item.copy" }] },
];
it("matches exact source and form, only new always information, deduplicating IDs", () => {
  expect(toolInformationIds([...information, information[0]], new Set<string>(), "Item.source", "scan")).toEqual(["only", "mixed"]);
  expect(toolInformationIds(information, new Set(["only"]), "Item.source", "scan")).toEqual(["mixed"]);
  expect(toolInformationIds(information, new Set<string>(), "Item.legacy", "scan")).toEqual([]);
});
it("keeps tool-only approaches out of skill and Aptitude calculations", () => {
  expect(reachableInformationIds(information, new Set<string>(), "perception", undefined, 6)).toEqual(["mixed"]);
  expect(reachableInformationIds(information, new Set<string>(), "aptitude", "arts", 99)).toEqual([]);
});
