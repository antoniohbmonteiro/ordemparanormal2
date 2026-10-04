import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ run: vi.fn(), select: vi.fn() }));
vi.mock("../equipment/laboratory-session", () => ({ runLaboratorySession: mocks.run }));
vi.mock("../../applications/equipment/equipment-use-dialog", () => ({ selectEquipmentUse: mocks.select }));
import { useInvestigationTool } from "./use-investigation-tool";
import { isEquipmentUseInFlight } from "../equipment/use-equipment";
beforeEach(() => { mocks.run.mockReset(); mocks.select.mockReset(); });
afterEach(() => vi.unstubAllGlobals());
let sequence = 0;
function fixture() {
  const equipment = { type: "equipment", system: { useForms: [
    { id: "analyze", name: "Analisar", description: "", consumesUse: false, mechanic: "laboratory" },
  ] } };
  const actor = { uuid: `Actor.labclient${++sequence}`, isOwner: true, getEmbeddedDocument: () => equipment } as unknown as foundry.documents.Actor;
  const view = { sessionId: "opaque", revision: 0, equipmentName: "Laboratório", formName: "Analisar", state: "prepared",
    dice: [], results: [], remaining: 0, ceiling: null };
  const query = vi.fn(async () => ({ status: "laboratory", view }));
  const gm = { id: "gm", query };
  const runtime = { user: { id: "owner", isGM: false }, users: { activeGM: gm as typeof gm | null } };
  vi.stubGlobal("game", runtime);
  return { actor, equipment, query, view, runtime, context: { sceneId: "s", itemUuid: "Item.private", runId: "run" } };
}
it.each([0, 1, 3])("delivers only the terminal %i discoveries and holds the shared busy lock during the challenge", async newCount => {
  const f = fixture();
  let complete!: (value: unknown) => void;
  mocks.run.mockImplementationOnce(() => new Promise(resolve => { complete = resolve; }));
  const result = useInvestigationTool(f.actor, "e", f.context);
  await vi.waitFor(() => expect(mocks.run).toHaveBeenCalledOnce());
  expect(isEquipmentUseInFlight(f.actor.uuid, "e")).toBe(true);
  expect(await useInvestigationTool(f.actor, "e", f.context)).toEqual({ status: "busy" });
  complete({ status: "success", newCount, manual: false });
  expect(await result).toEqual({ status: "success", newCount, manual: false });
  expect(isEquipmentUseInFlight(f.actor.uuid, "e")).toBe(false);
  expect(mocks.run.mock.calls[0][0]).toEqual(f.view);
  expect(f.query).toHaveBeenCalledWith("ordemparanormal2.usePoiTool", expect.objectContaining({ context: f.context }), { timeout: 10000 });
});
it.each([{ status: "cancelled" }, { status: "partial", stage: "analysis" }, { status: "forbidden" }])(
  "preserves cancellation and errors %j", async terminal => {
    const f = fixture(); mocks.run.mockResolvedValueOnce(terminal);
    expect(await useInvestigationTool(f.actor, "e", f.context)).toEqual(terminal);
  });
it("form cancellation never prepares a session; no-GM laboratory has no local fallback", async () => {
  const f = fixture();
  f.equipment.system.useForms.push({ ...f.equipment.system.useForms[0], id: "other" });
  mocks.select.mockResolvedValueOnce(null);
  expect(await useInvestigationTool(f.actor, "e", f.context)).toEqual({ status: "cancelled" });
  expect(f.query).not.toHaveBeenCalled();
  f.equipment.system.useForms.pop();
  f.runtime.users.activeGM = null;
  expect(await useInvestigationTool(f.actor, "e", f.context)).toEqual({ status: "gmRequired" });
  expect(mocks.run).not.toHaveBeenCalled();
});
