import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OpposedCheckStateV1 } from "../../../application/checks/opposed-check-state";
import { buildOpposedCheckTitle, createOpposedCheckMessage } from "./create-opposed-check-message";

function state(): OpposedCheckStateV1 {
  const side = (uuid: `Actor.${string}`, name: string) => ({
    participant: { kind: "actor" as const, uuid },
    selection: { kind: "skill" as const, key: "fighting" as const },
    presentation: { name, requestedCheckLabel: "Luta", requestedCheckContext: "Físico + Luta" },
  });
  return { schemaVersion: 1, left: side("Actor.left", "Victor"), right: side("Actor.right", "Edgar") };
}

describe("create Opposed Check message", () => {
  const create = vi.fn();
  const renderTemplate = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    create.mockResolvedValue({ id: "message" });
    renderTemplate.mockResolvedValue("<article>pending</article>");
    vi.stubGlobal("ChatMessage", { create });
    vi.stubGlobal("foundry", { applications: { handlebars: { loadTemplates: vi.fn().mockResolvedValue(undefined), renderTemplate } } });
    vi.stubGlobal("game", {
      user: { name: "Mestre" },
      i18n: {
        format: (_key: string, data: { check: string }) => `TESTE OPOSTO: ${data.check}`,
        localize: (key: string) => key.endsWith("GenericTitle") ? "TESTE OPOSTO" : "Conflito entre personagens",
      },
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  it("creates exactly one neutral message with the V1 state flag", async () => {
    const current = state();
    await createOpposedCheckMessage(current);
    expect(create).toHaveBeenCalledOnce();
    expect(create).toHaveBeenCalledWith({
      content: "<article>pending</article>",
      speaker: { alias: "Mestre" },
      flags: {
        ordemparanormal2: {
          cardPresentation: { card: "opposedCheck" },
          opposedCheck: current,
        },
      },
    });
  });

  it("keeps the title based on requested canonical selections", () => {
    const current = state();
    const alternateResult = {
      schemaVersion: 3 as const,
      check: { kind: "skill" as const, key: "fighting", name: "Luta" },
      components: [
        { kind: "attribute" as const, key: "mind", label: "Mente", die: 8 as const, result: 5 },
        { kind: "skill" as const, key: "fighting", label: "Luta", die: 6 as const, result: 4 },
      ],
      extraDice: [],
      total: 9,
    };
    expect(buildOpposedCheckTitle({ ...current, left: { ...current.left, result: alternateResult } })).toBe("TESTE OPOSTO: Luta");
    expect(buildOpposedCheckTitle({ ...current, right: { ...current.right, selection: { kind: "attribute", key: "mind" } } })).toBe("TESTE OPOSTO");
  });
});
