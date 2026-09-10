import { afterEach, describe, expect, it, vi } from "vitest";

async function loadModule(loadTemplates: ReturnType<typeof vi.fn>) {
  vi.stubGlobal("foundry", { applications: { handlebars: { loadTemplates } } });
  vi.resetModules();
  return import("./ensure-shared-partials-loaded");
}

afterEach(() => vi.unstubAllGlobals());

describe("ensureSharedPartialsLoaded", () => {
  it("loads the chat header and opposed portrait from one neutral loader", async () => {
    const loadTemplates = vi.fn().mockResolvedValue(undefined);
    const { ensureSharedPartialsLoaded } = await loadModule(loadTemplates);
    await ensureSharedPartialsLoaded();
    expect(loadTemplates).toHaveBeenCalledWith({
      chatCardHeader: "systems/ordemparanormal2/templates/chat/chat-card-header.hbs",
      opposedCheckPortrait: "systems/ordemparanormal2/templates/shared/opposed-check-portrait.hbs",
    });
  });

  it("reuses the same promise", async () => {
    const loadTemplates = vi.fn().mockResolvedValue(undefined);
    const { ensureSharedPartialsLoaded } = await loadModule(loadTemplates);
    const first = ensureSharedPartialsLoaded();
    const second = ensureSharedPartialsLoaded();
    await first;
    expect(first).toBe(second);
    expect(first).toBe(ensureSharedPartialsLoaded());
    expect(loadTemplates).toHaveBeenCalledOnce();
  });

  it("propagates loading failures", async () => {
    const loadTemplates = vi.fn().mockRejectedValue(new Error("network down"));
    const { ensureSharedPartialsLoaded } = await loadModule(loadTemplates);
    await expect(ensureSharedPartialsLoaded()).rejects.toThrow("network down");
    await expect(ensureSharedPartialsLoaded()).rejects.toThrow("network down");
    expect(loadTemplates).toHaveBeenCalledOnce();
  });
});
