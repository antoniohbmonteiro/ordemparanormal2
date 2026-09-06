import { afterEach, expect, it, vi } from "vitest";
import { registerPoiRegionReveal } from "./register-poi-region-reveal";
import { renderPoiRegionRevealConfig } from "../adapters/foundry/points-of-interest/poi-region-reveal-config";

afterEach(() => vi.unstubAllGlobals());

it("registers one specialized public render hook during init", () => {
  const on = vi.fn();
  vi.stubGlobal("Hooks", { on });
  registerPoiRegionReveal();
  expect(on).toHaveBeenCalledExactlyOnceWith("renderRegionConfig", renderPoiRegionRevealConfig);
});
