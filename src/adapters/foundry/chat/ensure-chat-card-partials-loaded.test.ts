import { afterEach, describe, expect, it, vi } from "vitest";

async function loadModule(loadTemplates: ReturnType<typeof vi.fn>) {
  vi.stubGlobal("foundry", {
    applications: { handlebars: { loadTemplates } },
  });
  vi.resetModules();
  return import("./ensure-chat-card-partials-loaded");
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ensureChatCardPartialsLoaded", () => {
  it("loads the shared chat card header partial by its systems path", async () => {
    const loadTemplates = vi.fn().mockResolvedValue(undefined);
    const { ensureChatCardPartialsLoaded } = await loadModule(loadTemplates);

    await ensureChatCardPartialsLoaded();

    expect(loadTemplates).toHaveBeenCalledWith({
      chatCardHeader:
        "systems/ordemparanormal2/templates/chat/chat-card-header.hbs",
    });
  });

  it("is idempotent: repeated calls reuse the same in-flight/resolved promise", async () => {
    const loadTemplates = vi.fn().mockResolvedValue(undefined);
    const { ensureChatCardPartialsLoaded } = await loadModule(loadTemplates);

    const first = ensureChatCardPartialsLoaded();
    const second = ensureChatCardPartialsLoaded();
    await first;
    const third = ensureChatCardPartialsLoaded();

    expect(first).toBe(second);
    expect(first).toBe(third);
    expect(loadTemplates).toHaveBeenCalledOnce();
  });

  it("propagates a rejection to every caller instead of swallowing it", async () => {
    const error = new Error("network down");
    const loadTemplates = vi.fn().mockRejectedValue(error);
    const { ensureChatCardPartialsLoaded } = await loadModule(loadTemplates);

    await expect(ensureChatCardPartialsLoaded()).rejects.toThrow("network down");
    await expect(ensureChatCardPartialsLoaded()).rejects.toThrow("network down");
    expect(loadTemplates).toHaveBeenCalledOnce();
  });
});
