import { afterEach, expect, it, vi } from "vitest";
import { refreshInvestigationShareCard } from "./refresh-investigation-share-card";

afterEach(() => vi.unstubAllGlobals());

it("updates the existing Share Check Message to rerender its card after grant state changes", async () => {
  const update = vi.fn();
  vi.stubGlobal("game", { messages: { get: (id: string) => id === "check" ? { update } : undefined } });
  await refreshInvestigationShareCard("check");
  expect(update).toHaveBeenCalledOnce();
  expect(update.mock.calls[0][0]).toHaveProperty("flags.ordemparanormal2.investigationShareCardRevision");
  await refreshInvestigationShareCard("missing");
  expect(update).toHaveBeenCalledOnce();
});
