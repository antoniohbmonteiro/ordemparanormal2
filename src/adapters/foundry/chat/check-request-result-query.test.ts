import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ parse: vi.fn(), submit: vi.fn() }));
vi.mock("../../../features/checks/submit-check-request-result", () => ({
  parseSubmitCheckRequestResultData: mocks.parse,
  submitCheckRequestResult: mocks.submit,
}));

import { CHECK_REQUEST_RESULT_QUERY, checkRequestResultQueryHandler, dispatchCheckRequestResult, registerCheckRequestResultQuery } from "./check-request-result-query";

const data = { messageId: "message", result: {} } as never;

describe("Check Request User Query", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.parse.mockReturnValue(data);
    mocks.submit.mockResolvedValue(undefined);
  });

  it("registers a system-prefixed query", () => {
    const queries: Record<string, unknown> = {};
    vi.stubGlobal("CONFIG", { queries });
    registerCheckRequestResultQuery();
    expect(queries[CHECK_REQUEST_RESULT_QUERY]).toBe(checkRequestResultQueryHandler);
  });

  it("uses only the authenticated context User", async () => {
    const canonical = { id: "player" } as foundry.documents.User;
    const get = vi.fn(() => canonical);
    vi.stubGlobal("game", { users: { get } });
    await checkRequestResultQueryHandler(data, { user: { id: "player" } as foundry.documents.User });
    expect(get).toHaveBeenCalledExactlyOnceWith("player");
    expect(mocks.submit).toHaveBeenCalledWith(data, canonical);
  });

  it("dispatches player submissions to the active GM", async () => {
    const query = vi.fn().mockResolvedValue(undefined);
    const activeGM = { id: "gm", query } as unknown as foundry.documents.User;
    vi.stubGlobal("game", { user: { id: "player" }, users: { activeGM } });
    await dispatchCheckRequestResult(data);
    expect(query).toHaveBeenCalledExactlyOnceWith(CHECK_REQUEST_RESULT_QUERY, data);
    expect(mocks.submit).not.toHaveBeenCalled();
  });
});
