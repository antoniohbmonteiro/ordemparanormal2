import { afterEach, expect, it, vi } from "vitest";
import { registerPoiInvestigation } from "./register-poi-investigation";
import { POI_INVESTIGATION_QUERY } from "../adapters/foundry/points-of-interest/poi-investigation-query";

const { refreshInvestigationApplication } = vi.hoisted(() => ({
  refreshInvestigationApplication: vi.fn(),
}));
vi.mock("../applications/points-of-interest/investigation-application", () => ({
  refreshInvestigationApplication,
}));

afterEach(() => vi.unstubAllGlobals());

it("registers the query and refreshes only the placement whose reveal state changed", () => {
  const queries: Record<string, unknown> = {};
  const hooks = new Map<string, (...args: unknown[]) => void>();
  vi.stubGlobal("CONFIG", { queries });
  vi.stubGlobal("Hooks", {
    on: (name: string, callback: (...args: unknown[]) => void) => hooks.set(name, callback),
  });
  vi.stubGlobal("foundry", {
    utils: {
      hasProperty: (object: object, path: string) => path.split(".").reduce<unknown>(
        (value, key) => value && typeof value === "object"
          ? (value as Record<string, unknown>)[key]
          : undefined,
        object,
      ) !== undefined,
    },
  });
  registerPoiInvestigation();
  expect(typeof queries[POI_INVESTIGATION_QUERY]).toBe("function");
  const updateRegion = hooks.get("updateRegion")!;
  updateRegion(
    { id: "region", parent: { id: "scene" } },
    { flags: { ordemparanormal2: { pointOfInterestInformationReveal: {
      itemUuid: "Item.poi", informationIds: ["opaque"],
    } } } },
  );
  expect(refreshInvestigationApplication).toHaveBeenCalledExactlyOnceWith("scene", "region");

  updateRegion(
    { id: "other", parent: { id: "scene" } },
    { shapes: [] },
  );
  expect(refreshInvestigationApplication).toHaveBeenCalledOnce();
});
