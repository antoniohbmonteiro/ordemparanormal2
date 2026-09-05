import { afterEach, describe, expect, it, vi } from "vitest";

import {
  LICENSE_NOTICE_SETTING_KEY,
  SYSTEM_ID,
} from "../config/system-config";
import { registerLicenseNotice } from "./register-license-notice";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("license notice bootstrap", () => {
  it("registers a hidden string setting in client scope and waits for ready", () => {
    const register = vi.fn();
    const once = vi.fn();
    vi.stubGlobal("game", { settings: { register } });
    vi.stubGlobal("Hooks", { once });

    registerLicenseNotice();

    expect(register).toHaveBeenCalledWith(
      SYSTEM_ID,
      LICENSE_NOTICE_SETTING_KEY,
      expect.objectContaining({
        scope: "client",
        config: false,
        type: String,
        default: "",
      }),
    );
    expect(once).toHaveBeenCalledOnce();
    expect(once.mock.calls[0]?.[0]).toBe("ready");
    expect(once.mock.calls[0]?.[1]).toBeTypeOf("function");
  });
});
