import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ABILITY_ITEM_TYPE,
  EQUIPMENT_ITEM_TYPE,
  OCCUPATION_ITEM_TYPE,
} from "../../config/system-config";

const createAbilitySnapshot = vi.fn((item: { readonly uuid: string }) => ({
  snapshot: true,
  from: item.uuid,
}));

vi.mock("../../adapters/foundry/abilities/ability-sources", () => ({
  createAbilitySnapshot,
}));

vi.mock("../profiles/profile-picker", () => ({
  confirmProfileReplacement: vi.fn(),
  ProfilePicker: class {},
}));

vi.mock("../occupations/occupation-picker", () => ({
  confirmOccupationReplacement: vi.fn(),
  OccupationPicker: class {},
}));

vi.mock("./agent-sheet-settings", () => ({
  AgentSheetSettings: class {},
}));

interface TestSheet {
  document: object;
  isEditable: boolean;
  editMode: boolean;
  _onDropItem(
    event: unknown,
    item: unknown,
  ): Promise<unknown>;
}

let AgentSheetClass: new (options: { document: object }) => TestSheet;
const superDropItem = vi.fn(async (_event: unknown, item: unknown) => ({
  fromSuper: item,
}));
const notificationWarn = vi.fn();

beforeAll(async () => {
  class MockActorSheetV2 {
    static DEFAULT_OPTIONS = {};
    static PARTS = {};
    static TABS = {};

    document: object;
    editMode = false;
    isEditable = true;

    constructor(options: { document: object }) {
      this.document = options.document;
    }

    protected async _onDropItem(event: unknown, item: unknown): Promise<unknown> {
      return superDropItem(event, item);
    }
  }

  vi.stubGlobal("foundry", {
    applications: {
      api: {
        DialogV2: { confirm: vi.fn() },
        HandlebarsApplicationMixin: <T>(Base: T): T => Base,
      },
      sheets: { ActorSheetV2: MockActorSheetV2 },
    },
  });
  vi.stubGlobal("game", {
    i18n: { localize: (key: string) => key },
  });
  vi.stubGlobal("ui", {
    notifications: { warn: notificationWarn, error: vi.fn() },
  });

  const module = await import("./agent-sheet");
  AgentSheetClass = module.AgentSheet as unknown as typeof AgentSheetClass;
});

beforeEach(() => {
  notificationWarn.mockClear();
  superDropItem.mockClear();
  createAbilitySnapshot.mockClear();
});

function createSheet(overrides: { isEditable?: boolean; editMode?: boolean } = {}) {
  const createEmbeddedDocuments = vi.fn().mockResolvedValue([{ id: "created" }]);
  const actor = { createEmbeddedDocuments };
  const sheet = new AgentSheetClass({ document: actor });
  sheet.isEditable = overrides.isEditable ?? true;
  sheet.editMode = overrides.editMode ?? false;
  return { sheet, actor, createEmbeddedDocuments };
}

describe("Agent Sheet drop permission", () => {
  it("refuses any drop when the sheet itself is not editable", async () => {
    const { sheet } = createSheet({ isEditable: false, editMode: true });
    const item = { type: ABILITY_ITEM_TYPE, actor: null, uuid: "Item.a" };

    await expect(sheet._onDropItem({}, item)).resolves.toBeNull();
    expect(notificationWarn).toHaveBeenCalledWith(
      "ORDEMPARANORMAL2.AgentSheet.Errors.ItemNotEditable",
    );
    expect(createAbilitySnapshot).not.toHaveBeenCalled();
    expect(superDropItem).not.toHaveBeenCalled();
  });

  it.each([ABILITY_ITEM_TYPE, EQUIPMENT_ITEM_TYPE])(
    "adds an external %s Item without requiring Edit Mode",
    async (type) => {
      const { sheet, actor } = createSheet({ isEditable: true, editMode: false });
      const item = { type, actor: null, uuid: "Compendium.foo.bar.Item.x" };

      await sheet._onDropItem({}, item);

      expect(notificationWarn).not.toHaveBeenCalled();
      if (type === ABILITY_ITEM_TYPE) {
        expect(createAbilitySnapshot).toHaveBeenCalledWith(item);
        expect(actor.createEmbeddedDocuments).toHaveBeenCalledOnce();
        expect(superDropItem).not.toHaveBeenCalled();
      } else {
        expect(superDropItem).toHaveBeenCalledWith({}, item);
      }
    },
  );

  it.each([ABILITY_ITEM_TYPE, EQUIPMENT_ITEM_TYPE])(
    "still requires Edit Mode to reorder an already-embedded %s Item",
    async (type) => {
      const { sheet, actor } = createSheet({ isEditable: true, editMode: false });
      const item = { type, actor, uuid: "Actor.a.Item.x" };

      await expect(sheet._onDropItem({}, item)).resolves.toBeNull();

      expect(notificationWarn).toHaveBeenCalledWith(
        "ORDEMPARANORMAL2.AgentSheet.Errors.EditModeRequired",
      );
      expect(superDropItem).not.toHaveBeenCalled();
    },
  );

  it.each([ABILITY_ITEM_TYPE, EQUIPMENT_ITEM_TYPE])(
    "reorders an already-embedded %s Item natively once Edit Mode is on",
    async (type) => {
      const { sheet, actor } = createSheet({ isEditable: true, editMode: true });
      const item = { type, actor, uuid: "Actor.a.Item.x" };

      await sheet._onDropItem({}, item);

      expect(notificationWarn).not.toHaveBeenCalled();
      expect(superDropItem).toHaveBeenCalledWith({}, item);
    },
  );

  it("still requires Edit Mode for unrelated item types like Occupation", async () => {
    const { sheet } = createSheet({ isEditable: true, editMode: false });
    const item = { type: OCCUPATION_ITEM_TYPE, actor: null, uuid: "Item.occ" };

    await expect(sheet._onDropItem({}, item)).resolves.toBeNull();

    expect(notificationWarn).toHaveBeenCalledWith(
      "ORDEMPARANORMAL2.AgentSheet.Errors.EditModeRequired",
    );
    expect(superDropItem).not.toHaveBeenCalled();
  });
});
