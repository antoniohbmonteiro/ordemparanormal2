import { afterEach, describe, expect, it, vi } from "vitest";

import type { CheckSnapshotV3 } from "../../../application/checks/check-snapshot";
import { publishOpposedCheckMessage } from "./publish-opposed-check-message";

const check: CheckSnapshotV3 = {
  schemaVersion: 3,
  check: { kind: "attribute", key: "physical", name: "Físico" },
  components: [
    {
      kind: "attribute",
      key: "physical",
      label: "Físico",
      die: 8,
      result: 5,
    },
  ],
  extraDice: [],
  total: 5,
};

function actor(name: string, img: string) {
  return { name, img } as unknown as foundry.documents.Actor;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("publishOpposedCheckMessage", () => {
  it("publishes one neutral card without associating either participant as speaker", async () => {
    const renderTemplate = vi.fn().mockResolvedValue("<article>opposed</article>");
    const loadTemplates = vi.fn().mockResolvedValue(undefined);
    const create = vi.fn().mockResolvedValue({});
    vi.stubGlobal("foundry", {
      applications: { handlebars: { renderTemplate, loadTemplates } },
    });
    vi.stubGlobal("ChatMessage", { create });
    vi.stubGlobal("game", { user: { name: "Mestre" } });

    await publishOpposedCheckMessage({
      title: "TESTE OPOSTO: LUTA",
      subtitle: "Conflito entre personagens",
      left: { actor: actor(" Victor ", " actors/victor.webp "), check },
      right: { actor: actor("Alan", "actors/alan.webp"), check },
      winner: "left",
    });

    expect(renderTemplate).toHaveBeenCalledWith(
      "systems/ordemparanormal2/templates/chat/opposed-check-card.hbs",
      expect.objectContaining({
        left: expect.objectContaining({ name: "Victor", img: "actors/victor.webp" }),
        right: expect.objectContaining({ name: "Alan", img: "actors/alan.webp" }),
        winner: expect.objectContaining({ name: "Victor" }),
      }),
    );
    expect(create).toHaveBeenCalledOnce();
    expect(create).toHaveBeenCalledWith({
      content: "<article>opposed</article>",
      speaker: { alias: "Mestre" },
      flags: {
        ordemparanormal2: {
          cardPresentation: { card: "opposedCheck" },
        },
      },
    });
    const messageData = create.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(messageData).not.toHaveProperty("check");
    expect(JSON.stringify(messageData)).not.toContain("accentColor");
    expect(JSON.stringify(messageData.speaker)).not.toContain("actor");
  });
});
