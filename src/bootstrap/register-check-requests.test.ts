import { describe, expect, it, vi } from "vitest";

vi.mock("../adapters/foundry/chat/check-request-result-query", () => ({ registerCheckRequestResultQuery: vi.fn() }));
import { registerCheckRequestResultQuery } from "../adapters/foundry/chat/check-request-result-query";
import { registerCheckRequests } from "./register-check-requests";

describe("Check Request bootstrap", () => {
  it("registers its User Query", () => {
    registerCheckRequests();
    expect(registerCheckRequestResultQuery).toHaveBeenCalledExactlyOnceWith();
  });
});
