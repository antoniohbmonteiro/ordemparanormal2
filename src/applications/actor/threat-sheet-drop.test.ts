import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

class MockActorSheet {
  isEditable = true;
  tabGroups = { content: "notes" };
  readonly _onNativeDrop = vi.fn();
  readonly render = vi.fn();

  constructor(readonly document: object) {}

  async _onDropItem(event: unknown, item: unknown) {
    return this._onNativeDrop(event, item);
  }
}

let ThreatSheet: typeof MockActorSheet;
const notify = vi.fn();

beforeAll(async () => {
  vi.stubGlobal("foundry", {
    abstract: { TypeDataModel: class {} },
    applications: {
      api: { HandlebarsApplicationMixin: (base: typeof MockActorSheet) => base },
      sheets: { ActorSheetV2: MockActorSheet },
    },
    utils: { deepClone: structuredClone },
  });
  vi.stubGlobal("game", { user: {}, i18n: {
    localize: (key: string) => key,
    format: (_key: string, data: { name: string; tab?: string }) => data.tab ? `${data.name} ${data.tab}` : data.name,
  } });
  vi.stubGlobal("ui", { notifications: { info: notify } });
  ThreatSheet = (await import("./threat-sheet")).ThreatSheet as unknown as typeof MockActorSheet;
});

afterAll(() => vi.unstubAllGlobals());

function fixture(uses: object[] = []) {
  const created = { id: "created", name: "Teste", system: { uses } };
  const ownedItems: object[] = [];
  const actor = {
    createEmbeddedDocuments: vi.fn(async (_type: string, [source]: { flags: object }[]) => {
      ownedItems.push({ ...created, type: "ability", flags: source?.flags });
      return [created];
    }),
    canUserModify: vi.fn(() => true),
    getEmbeddedCollection: () => ownedItems,
  };
  const sheet = new ThreatSheet(actor);
  const item = {
    type: "ability", name: "Teste", img: "icons/svg/item-bag.svg",
    visible: true, isEmbedded: false, uuid: "Item.ability",
    toObject: () => ({ system: { uses: [] } }),
  };
  return { actor, sheet, item, created };
}

describe("Threat Sheet Ability drop", () => {
  it.each(["Item.ability", "Compendium.ordemparanormal2.abilities.Item.ability"])(
    "embeds a copy of %s outside Edit Mode",
    async (uuid) => {
      const { actor, sheet, item, created } = fixture();
      await expect(sheet._onDropItem({}, { ...item, uuid })).resolves.toBe(created);
      expect(actor.createEmbeddedDocuments).toHaveBeenCalledExactlyOnceWith("Item", [
        expect.objectContaining({ flags: { ordemparanormal2: { sourceUuid: uuid } } }),
      ]);
      expect(sheet.render).toHaveBeenCalledExactlyOnceWith({ force: true });
      expect(sheet.tabGroups.content).toBe("abilities");
      expect(notify).toHaveBeenLastCalledWith("Teste ORDEMPARANORMAL2.AgentSheet.Tabs.Abilities");
    },
  );

  it("takes a combat Ability to the same Abilities tab", async () => {
    const { sheet, item } = fixture([{
      id: "use", name: "Ataque", description: "", minimumLevel: null,
      cost: { source: "none", amount: 0 },
      combatAction: { typeLabel: "", requirements: "", check: null, damage: null },
    }]);
    await sheet._onDropItem({}, item);
    expect(sheet.tabGroups.content).toBe("abilities");
    expect(notify).toHaveBeenLastCalledWith("Teste ORDEMPARANORMAL2.AgentSheet.Tabs.Abilities");
  });

  it("keeps one copy per source across overlapping and later drops, even when different sources share a name", async () => {
    const { actor, sheet, item } = fixture();
    await Promise.all([sheet._onDropItem({}, item), sheet._onDropItem({}, item)]);
    expect(actor.createEmbeddedDocuments).toHaveBeenCalledOnce();
    await sheet._onDropItem({}, item);
    expect(notify).toHaveBeenLastCalledWith("Teste");
    expect(actor.createEmbeddedDocuments).toHaveBeenCalledOnce();
    await sheet._onDropItem({}, { ...item, uuid: "Item.other" });
    expect(actor.createEmbeddedDocuments).toHaveBeenCalledTimes(2);
  });

  it("keeps Actor permissions and blocks reordering outside Edit Mode", async () => {
    const { actor, sheet, item } = fixture();
    await expect(sheet._onDropItem({}, { ...item, actor, isEmbedded: true })).resolves.toBeNull();
    expect(sheet._onNativeDrop).not.toHaveBeenCalled();
    actor.canUserModify.mockReturnValue(false);
    await expect(sheet._onDropItem({}, item)).resolves.toBeNull();
    expect(actor.createEmbeddedDocuments).not.toHaveBeenCalled();
  });
});
