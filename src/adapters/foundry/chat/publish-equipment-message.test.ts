import { afterEach, describe, expect, it, vi } from "vitest";

import { publishEquipmentMessage } from "./publish-equipment-message";

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubFoundry(renderTemplate = vi.fn().mockResolvedValue("<article>card</article>")) {
  const create = vi.fn().mockResolvedValue({});
  const getSpeaker = vi.fn(() => ({ actor: "actor-id" }));
  const enrichHTML = vi.fn((value: string) =>
    Promise.resolve(`<enriched>${value}</enriched>`),
  );
  const loadTemplates = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal("foundry", {
    utils: { escapeHTML: (value: string) => value.replaceAll("<", "&lt;").replaceAll(">", "&gt;") },
    applications: {
      handlebars: { renderTemplate, loadTemplates },
      ux: { TextEditor: { implementation: { enrichHTML } } },
    },
  });
  vi.stubGlobal("ChatMessage", { getSpeaker, create });
  return { renderTemplate, create, getSpeaker, loadTemplates };
}

function actorWith(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "actor-id",
    system: {},
    getEmbeddedCollection: vi.fn(() => []),
    ...overrides,
  } as unknown as foundry.documents.Actor;
}

const actor = actorWith();

function equipmentWith(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    type: "equipment",
    name: "Pó Revelador",
    img: "icons/svg/aura.svg",
    isOwner: true,
    system: { description: "Reage a vestígios.", category: "tool", uses: { value: 5, max: 5 } },
    ...overrides,
  } as unknown as foundry.documents.Item;
}

describe("publishEquipmentMessage", () => {
  it("includes the committed form in a card and recognizes an already published operation", async () => {
    const { renderTemplate, create } = stubFoundry();
    vi.stubGlobal("game", { messages: { contents: [] } });
    await publishEquipmentMessage(actor, equipmentWith(), {
      id: "scan", name: "<Analisar>", description: "Resultado narrativo", consumesUse: true, mechanic: "standard",
    }, "owner:operation");
    expect(renderTemplate.mock.calls[0][1].description).toContain("&lt;Analisar&gt;");
    expect(renderTemplate.mock.calls[0][1].description).toContain("Resultado narrativo");
    expect(create.mock.calls[0][0].flags.ordemparanormal2.equipmentUseOperation).toBe("owner:operation");
    vi.stubGlobal("game", { messages: { contents: [{ getFlag: () => "owner:operation" }] } });
    await publishEquipmentMessage(actor, equipmentWith(), null, "owner:operation");
    expect(create).toHaveBeenCalledOnce();
  });

  it("reports a rejected message creation instead of completing the payment stage twice", async () => {
    const { create } = stubFoundry();
    create.mockResolvedValueOnce(undefined);
    await expect(publishEquipmentMessage(actor, equipmentWith())).rejects.toThrow("was not created");
  });
  it("renders the card with the enriched description, category and uses, and posts it as the Agent", async () => {
    const { renderTemplate, create, getSpeaker } = stubFoundry();

    await publishEquipmentMessage(actor, equipmentWith());

    expect(renderTemplate).toHaveBeenCalledWith(
      "systems/ordemparanormal2/templates/chat/equipment-card.hbs",
      {
        name: "Pó Revelador",
        img: "icons/svg/aura.svg",
        categoryLabelKey: "ORDEMPARANORMAL2.Equipment.Categories.tool",
        hasDescription: true,
        description: "<enriched>Reage a vestígios.</enriched>",
        hasUses: true,
        uses: { value: 5, max: 5 },
      },
    );
    expect(getSpeaker).toHaveBeenCalledWith({ actor });
    expect(create).toHaveBeenCalledWith({
      content: "<article>card</article>",
      speaker: { actor: "actor-id" },
      flags: {
        ordemparanormal2: {
          cardPresentation: { card: "equipment", accentColor: "#7F252B" },
        },
      },
    });
  });

  it("ignores non-equipment Items", async () => {
    const { create } = stubFoundry();

    await publishEquipmentMessage(actor, equipmentWith({ type: "profile" }));

    expect(create).not.toHaveBeenCalled();
  });

  it("snapshots the effective Agent accent color into the card presentation flag", async () => {
    const { create } = stubFoundry();
    const accentedActor = actorWith({
      system: { appearance: { accentColor: "#4176BA" } },
    });

    await publishEquipmentMessage(accentedActor, equipmentWith());

    const messageData = create.mock.calls[0]?.[0] as {
      flags: { ordemparanormal2: { cardPresentation: { accentColor: string } } };
    };
    expect(messageData.flags.ordemparanormal2.cardPresentation).toEqual({
      card: "equipment",
      accentColor: "#4176BA",
    });
  });

  it("awaits the shared chat card partials before rendering the card template", async () => {
    const callOrder: string[] = [];
    const loadTemplates = vi.fn(async () => {
      callOrder.push("loadTemplates");
    });
    const renderTemplate = vi.fn(async () => {
      callOrder.push("renderTemplate");
      return "<article>card</article>";
    });
    const enrichHTML = vi.fn((value: string) => Promise.resolve(value));
    vi.stubGlobal("foundry", {
      applications: {
        handlebars: { renderTemplate, loadTemplates },
        ux: { TextEditor: { implementation: { enrichHTML } } },
      },
    });
    vi.stubGlobal("ChatMessage", {
      getSpeaker: vi.fn(() => ({})),
      create: vi.fn().mockResolvedValue({}),
    });
    vi.resetModules();
    const { publishEquipmentMessage: freshPublishEquipmentMessage } = await import(
      "./publish-equipment-message"
    );

    await freshPublishEquipmentMessage(actor, equipmentWith());

    expect(callOrder).toEqual(["loadTemplates", "renderTemplate"]);
  });
});
