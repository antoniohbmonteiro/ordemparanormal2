import { describe, expect, it } from "vitest";
import { planEquipmentUse } from "./equipment-use-plan";

const forms = [{ id: "scan", name: "Examinar", description: "", consumesUse: true, mechanic: "standard" },
  { id: "observe", name: "Observar", description: "", consumesUse: false, mechanic: "standard" }];
describe("equipment use payment", () => {
  it("preserves legacy publication without a form or automatic payment", () => {
    expect(planEquipmentUse([], { value: 2, max: 2 }, null)).toEqual({ status: "ready", use: null, remaining: null });
    expect(planEquipmentUse([], null, "missing")).toEqual({ status: "invalid" });
  });
  it("charges exactly one use of a selected consumable form", () => {
    expect(planEquipmentUse(forms, { value: 2, max: 3 }, "scan")).toEqual({ status: "ready", use: forms[0], remaining: 1 });
    expect(planEquipmentUse(forms, { value: 0, max: 3 }, "scan")).toEqual({ status: "insufficient" });
  });
  it.each([null, undefined, { value: -1, max: 3 }, { value: 1.5, max: 3 }])(
    "rejects an absent or malformed payment counter %j", resource => {
      expect(planEquipmentUse(forms, resource, "scan")).toEqual({ status: "invalid" });
      expect(planEquipmentUse(forms, resource, "observe")).toEqual({ status: "ready", use: forms[1], remaining: null });
    });
  it("allows a free form at zero uses and rejects a stale or absent selection", () => {
    expect(planEquipmentUse(forms, { value: 0, max: 3 }, "observe").status).toBe("ready");
    expect(planEquipmentUse(forms.slice(1), { value: 2, max: 3 }, "scan").status).toBe("invalid");
    expect(planEquipmentUse(forms, null, null).status).toBe("invalid");
    expect(planEquipmentUse([{ ...forms[0], consumesUse: "true" }], null, "scan").status).toBe("invalid");
  });
});
