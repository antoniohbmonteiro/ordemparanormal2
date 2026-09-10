import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../applications/gm-tools/gm-tools-palette-controller", () => ({
  synchronizeGmToolsPalette: vi.fn(async () => undefined),
}));

import { synchronizeGmToolsPalette } from "../applications/gm-tools/gm-tools-palette-controller";
import { registerGmTools } from "./register-gm-tools";

afterEach(() => vi.unstubAllGlobals());

describe("GM Tools bootstrap", () => {
  it("synchronizes the palette once the Foundry client is ready", () => {
    const once = vi.fn();
    const on = vi.fn();
    vi.stubGlobal("Hooks", { on, once });

    registerGmTools();

    expect(once).toHaveBeenCalledOnce();
    expect(once.mock.calls[0][0]).toBe("ready");
    once.mock.calls[0][1]();
    expect(synchronizeGmToolsPalette).toHaveBeenCalledExactlyOnceWith();
    expect(on).not.toHaveBeenCalled();
  });
});
