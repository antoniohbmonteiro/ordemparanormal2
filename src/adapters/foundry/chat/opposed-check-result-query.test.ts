import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  parse: vi.fn(),
  submit: vi.fn(),
}));

vi.mock("../../../features/checks/submit-opposed-check-result", () => ({
  parseSubmitOpposedCheckResultData: mocks.parse,
  submitOpposedCheckResult: mocks.submit,
}));

import {
  OPPOSED_CHECK_RESULT_QUERY,
  dispatchOpposedCheckResult,
  opposedCheckResultQueryHandler,
  registerOpposedCheckResultQuery,
} from "./opposed-check-result-query";

const data = { messageId: "message", side: "left", result: {} } as never;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.parse.mockReturnValue(data);
  mocks.submit.mockResolvedValue(undefined);
});

describe("Opposed Check User Query", () => {
  it("registers the prefixed handler", () => {
    const queries: Record<string, unknown> = {};
    vi.stubGlobal("CONFIG", { queries });
    registerOpposedCheckResultQuery();
    expect(queries[OPPOSED_CHECK_RESULT_QUERY]).toBe(opposedCheckResultQueryHandler);
  });

  it("uses the authenticated Foundry context User and resolves its canonical instance", async () => {
    const contextUser = { id: "sender" } as foundry.documents.User;
    const canonicalUser = { id: "sender", isGM: false } as foundry.documents.User;
    const get = vi.fn(() => canonicalUser);
    vi.stubGlobal("game", { users: { get } });

    await opposedCheckResultQueryHandler(data, { user: contextUser, timeout: 5000 });

    expect(get).toHaveBeenCalledExactlyOnceWith("sender");
    expect(mocks.submit).toHaveBeenCalledExactlyOnceWith(data, canonicalUser);
  });

  it("rejects malformed data before authority processing", async () => {
    mocks.parse.mockReturnValue(null);
    vi.stubGlobal("game", { users: { get: vi.fn() } });
    await expect(opposedCheckResultQueryHandler({ senderId: "forged" } as never, {
      user: { id: "real" } as foundry.documents.User,
    })).rejects.toThrow("Invalid Opposed Check query payload");
    expect(mocks.submit).not.toHaveBeenCalled();
  });

  it("uses the direct authority path only for the active GM", async () => {
    const activeGM = { id: "gm", query: vi.fn() } as unknown as foundry.documents.User;
    vi.stubGlobal("game", { user: activeGM, users: { activeGM, get: vi.fn(() => activeGM) } });
    await dispatchOpposedCheckResult(data);
    expect(mocks.submit).toHaveBeenCalledExactlyOnceWith(data, activeGM);
    expect(activeGM.query).not.toHaveBeenCalled();
  });

  it("queries the active GM for every other user", async () => {
    const query = vi.fn().mockResolvedValue(undefined);
    const activeGM = { id: "gm", query } as unknown as foundry.documents.User;
    vi.stubGlobal("game", { user: { id: "player" }, users: { activeGM } });
    await dispatchOpposedCheckResult(data);
    expect(query).toHaveBeenCalledExactlyOnceWith(OPPOSED_CHECK_RESULT_QUERY, data);
    expect(mocks.submit).not.toHaveBeenCalled();
  });

  it("fails without an active GM", async () => {
    vi.stubGlobal("game", { user: { id: "player" }, users: { activeGM: null } });
    await expect(dispatchOpposedCheckResult(data)).rejects.toThrow("No active GM");
  });
});
