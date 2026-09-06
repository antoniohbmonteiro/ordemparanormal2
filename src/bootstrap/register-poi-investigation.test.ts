import { afterEach, expect, it, vi } from "vitest";
import { registerPoiInvestigation } from "./register-poi-investigation";
import { POI_INVESTIGATION_QUERY } from "../adapters/foundry/points-of-interest/poi-investigation-query";

afterEach(() => vi.unstubAllGlobals());

it("registers the POI investigation query handler once during init", () => {
  const queries: Record<string, unknown> = {};
  vi.stubGlobal("CONFIG", { queries });
  registerPoiInvestigation();
  expect(typeof queries[POI_INVESTIGATION_QUERY]).toBe("function");
});
