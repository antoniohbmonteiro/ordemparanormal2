import { describe, expect, it, vi } from "vitest";

const registerQuery = vi.hoisted(() => vi.fn());
vi.mock("../adapters/foundry/chat/opposed-check-result-query", () => ({
  registerOpposedCheckResultQuery: registerQuery,
}));

import { registerOpposedChecks } from "./register-opposed-checks";

describe("register Opposed Checks", () => {
  it("registers the User Query boundary", () => {
    registerOpposedChecks();
    expect(registerQuery).toHaveBeenCalledExactlyOnceWith();
  });
});
