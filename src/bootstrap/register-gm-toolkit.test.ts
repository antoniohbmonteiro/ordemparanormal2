import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../applications/gm-tools/gm-toolkit-controller", () => ({
  synchronizeGmToolkit: vi.fn(async () => undefined),
}));

import { synchronizeGmToolkit } from "../applications/gm-tools/gm-toolkit-controller";
import { registerGmToolkit } from "./register-gm-toolkit";

afterEach(() => vi.unstubAllGlobals());

describe("GM Tools bootstrap", () => {
  it("synchronizes the palette once the Foundry client is ready", () => {
    const once = vi.fn();
    const on = vi.fn();
    vi.stubGlobal("Hooks", { on, once });

    registerGmToolkit();

    expect(once).toHaveBeenCalledOnce();
    expect(once.mock.calls[0][0]).toBe("ready");
    once.mock.calls[0][1]();
    expect(synchronizeGmToolkit).toHaveBeenCalledExactlyOnceWith();
    expect(on).not.toHaveBeenCalled();
  });
});
