import { afterEach, expect, it, vi } from "vitest";
import { registerPoiRegionConfig } from "./register-poi-region-config";
import { renderPoiRegionConfig } from "../adapters/foundry/points-of-interest/poi-region-config";

afterEach(() => vi.unstubAllGlobals());

it("registers one specialized public render hook during init", () => {
  const on = vi.fn();
  vi.stubGlobal("Hooks", { on });
  registerPoiRegionConfig();
  expect(on).toHaveBeenCalledExactlyOnceWith("renderRegionConfig", renderPoiRegionConfig);
});
