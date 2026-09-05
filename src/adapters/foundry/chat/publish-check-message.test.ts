import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getCurrentMessageMode,
  publishCheckMessage,
  sendRollToMessage,
} from "./publish-check-message";

const REGISTERED_MODES = [
  "public",
  "gm",
  "blind",
  "self",
  "ic",
  "system-secret",
] as const;

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubFoundryMode(mode: unknown): void {
  vi.stubGlobal("CONFIG", {
    ChatMessage: {
      modes: Object.fromEntries(
        REGISTERED_MODES.map((key) => [key, { handler: vi.fn() }]),
      ),
    },
  });
  vi.stubGlobal("game", {
    settings: {
      get: vi.fn(() => mode),
    },
  });
}

describe("Foundry chat message mode", () => {
  it.each(REGISTERED_MODES)(
    "passes registered mode %s to Roll.toMessage unchanged",
    async (mode) => {
      stubFoundryMode(mode);
      const toMessage = vi.fn().mockResolvedValue({});

      await sendRollToMessage({ toMessage }, { content: "card" });

      expect(getCurrentMessageMode()).toBe(mode);
      expect(toMessage).toHaveBeenCalledWith(
        { content: "card" },
        { messageMode: mode },
      );
    },
  );

  it.each(["missing", null, undefined, 1])(
    "rejects unregistered mode %j without creating a message",
    async (mode) => {
      stubFoundryMode(mode);
      const toMessage = vi.fn();

      await expect(
        sendRollToMessage({ toMessage }, { content: "card" }),
      ).rejects.toThrow("Unregistered");
      expect(toMessage).not.toHaveBeenCalled();
    },
  );

  it("does not accept inherited registry properties", async () => {
    stubFoundryMode("toString");
    const toMessage = vi.fn();

    await expect(
      sendRollToMessage({ toMessage }, { content: "card" }),
    ).rejects.toThrow("Unregistered");
    expect(toMessage).not.toHaveBeenCalled();
  });

  it("publishes the speaker without persisting presentation-only actor data", async () => {
    stubFoundryMode("public");
    const renderTemplate = vi.fn().mockResolvedValue("<article>card</article>");
    const loadTemplates = vi.fn().mockResolvedValue(undefined);
    const getSpeaker = vi.fn(() => ({ actor: "actor-id" }));
    const toMessage = vi.fn().mockResolvedValue({});
    vi.stubGlobal("foundry", {
      applications: { handlebars: { renderTemplate, loadTemplates } },
    });
    vi.stubGlobal("ChatMessage", { getSpeaker });
    const actor = {
      id: "actor-id",
      img: "actors/agent.webp",
      system: { appearance: { accentColor: "#4176BA" } },
      getEmbeddedCollection: vi.fn(() => []),
    } as unknown as foundry.documents.Actor;
    const execution = {
      result: {
        check: { kind: "attribute", key: "mind", name: "Mente" },
        components: [
          {
            kind: "attribute",
            key: "mind",
            label: "Mente",
            die: 8,
            result: 5,
          },
        ],
        extraDice: [],
        total: 5,
      },
      roll: { toMessage },
    } as unknown as Parameters<typeof publishCheckMessage>[1];

    await publishCheckMessage(actor, execution);

    expect(renderTemplate).toHaveBeenCalledWith(
      "systems/ordemparanormal2/templates/chat/check-card.hbs",
      expect.not.objectContaining({
        portrait: expect.anything(),
        actorPortrait: expect.anything(),
      }),
    );
    expect(getSpeaker).toHaveBeenCalledWith({ actor });
    const messageData = toMessage.mock.calls[0]?.[0] as {
      flags: {
        ordemparanormal2: {
          check: Record<string, unknown>;
          checkPresentation: { accentColor: string };
        };
      };
    };
    expect(messageData.flags.ordemparanormal2.check).not.toHaveProperty(
      "portrait",
    );
    expect(messageData.flags.ordemparanormal2.check).not.toHaveProperty(
      "actorPortrait",
    );
    expect(messageData.flags.ordemparanormal2.check).not.toHaveProperty(
      "timestamp",
    );
    expect(messageData.flags.ordemparanormal2.check).not.toHaveProperty(
      "accentColor",
    );
    expect(
      messageData.flags.ordemparanormal2.checkPresentation,
    ).toEqual({ accentColor: "#4176BA" });
  });

  it("awaits the shared chat card partials before rendering the card template", async () => {
    stubFoundryMode("public");
    const callOrder: string[] = [];
    const loadTemplates = vi.fn(async () => {
      callOrder.push("loadTemplates");
    });
    const renderTemplate = vi.fn(async () => {
      callOrder.push("renderTemplate");
      return "<article>card</article>";
    });
    vi.stubGlobal("foundry", {
      applications: { handlebars: { renderTemplate, loadTemplates } },
    });
    vi.stubGlobal("ChatMessage", { getSpeaker: vi.fn(() => ({})) });
    vi.resetModules();
    const { publishCheckMessage: freshPublishCheckMessage } = await import(
      "./publish-check-message"
    );
    const toMessage = vi.fn().mockResolvedValue({});
    const actor = {
      system: {},
      getEmbeddedCollection: vi.fn(() => []),
    } as unknown as foundry.documents.Actor;
    const execution = {
      result: {
        check: { kind: "attribute", key: "mind", name: "Mente" },
        components: [
          { kind: "attribute", key: "mind", label: "Mente", die: 8, result: 5 },
        ],
        extraDice: [],
        total: 5,
      },
      roll: { toMessage },
    } as unknown as Parameters<typeof publishCheckMessage>[1];

    await freshPublishCheckMessage(actor, execution);

    expect(callOrder).toEqual(["loadTemplates", "renderTemplate"]);
  });

  it("snapshots the current effective Profile accent when publishing", async () => {
    stubFoundryMode("public");
    vi.stubGlobal("foundry", {
      applications: {
        handlebars: {
          renderTemplate: vi.fn().mockResolvedValue("card"),
          loadTemplates: vi.fn().mockResolvedValue(undefined),
        },
      },
    });
    vi.stubGlobal("ChatMessage", { getSpeaker: vi.fn(() => ({})) });
    const toMessage = vi.fn().mockResolvedValue({});
    const actor = {
      system: {},
      getEmbeddedCollection: vi.fn(() => [
        { type: "profile", system: { accentColor: "#4B7E2F" } },
      ]),
    } as unknown as foundry.documents.Actor;
    const execution = {
      result: {
        check: { kind: "attribute", key: "mind", name: "Mente" },
        components: [
          { kind: "attribute", key: "mind", label: "Mente", die: 8, result: 5 },
        ],
        extraDice: [],
        total: 5,
      },
      roll: { toMessage },
    } as unknown as Parameters<typeof publishCheckMessage>[1];

    await publishCheckMessage(actor, execution);

    expect(toMessage.mock.calls[0]?.[0]).toMatchObject({
      flags: {
        ordemparanormal2: {
          checkPresentation: { accentColor: "#4B7E2F" },
        },
      },
    });
  });
});
