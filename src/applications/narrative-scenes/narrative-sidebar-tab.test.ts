import { beforeEach, describe, expect, it, vi } from "vitest";

const setting = vi.hoisted(() => ({ get: vi.fn() }));
const operations = vi.hoisted(() => ({
  start: vi.fn(),
  end: vi.fn(),
}));

vi.mock(
  "../../adapters/foundry/narrative-scenes/narrative-scene-setting",
  () => ({ getActiveNarrativeScene: setting.get }),
);
vi.mock("../../features/narrative-scenes/manage-narrative-scene", () => ({
  startNarrativeScene: operations.start,
  endNarrativeScene: operations.end,
}));

class FakeElement {
  dataset: DOMStringMap = {};
}

class FakeInputElement extends FakeElement {
  constructor(readonly value: string) {
    super();
  }
}

class FakeButtonElement extends FakeElement {
  form?: {
    readonly elements: {
      namedItem(name: string): FakeInputElement | null;
    };
  };
}

class FakeAbstractSidebarTab {
  static tabName = "";
  rendered = true;
  readonly render = vi.fn(async () => this);

  protected async _onRender(): Promise<void> {}
  protected _onClose(): void {}
}

type Action = (
  this: InstanceType<typeof FakeAbstractSidebarTab>,
  event: PointerEvent,
  target: HTMLElement,
) => Promise<void>;

interface TestableTab {
  readonly render: ReturnType<typeof vi.fn>;
  readonly rendered: boolean;
  _prepareContext(options: object): Promise<{
    readonly canManage: boolean;
    readonly isActive: boolean;
    readonly scene: { readonly id: string; readonly name: string } | null;
  }>;
  _onRender(context: object, options: object): Promise<void>;
  _onClose(options: object): void;
}

async function loadSidebarModule() {
  return import("./narrative-sidebar-tab");
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  setting.get.mockReturnValue(null);
  operations.start.mockResolvedValue({ status: "started" });
  operations.end.mockResolvedValue({ status: "ended" });

  vi.stubGlobal("HTMLElement", FakeElement);
  vi.stubGlobal("HTMLInputElement", FakeInputElement);
  vi.stubGlobal("HTMLButtonElement", FakeButtonElement);
  vi.stubGlobal("game", {
    i18n: { localize: (key: string) => key },
    user: { isGM: true },
  });
  vi.stubGlobal("ui", {
    notifications: {
      error: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
    },
  });
  vi.stubGlobal("foundry", {
    applications: {
      api: {
        HandlebarsApplicationMixin: (Base: typeof FakeAbstractSidebarTab) =>
          class extends Base {},
      },
      sidebar: { AbstractSidebarTab: FakeAbstractSidebarTab },
    },
  });
});

describe("NarrativeSidebarTab", () => {
  it("reads the persisted setting for every render context", async () => {
    setting.get.mockReturnValue({ id: "scene-1", name: "Laboratório" });
    const { NarrativeSidebarTab } = await loadSidebarModule();
    const tab = new NarrativeSidebarTab() as unknown as TestableTab;

    await expect(tab._prepareContext({})).resolves.toEqual({
      canManage: true,
      isActive: true,
      scene: { id: "scene-1", name: "Laboratório" },
    });
    expect(setting.get).toHaveBeenCalledOnce();
  });

  it("does not expose management in a non-GM context", async () => {
    vi.stubGlobal("game", {
      i18n: { localize: (key: string) => key },
      user: { isGM: false },
    });
    const { NarrativeSidebarTab } = await loadSidebarModule();
    const tab = new NarrativeSidebarTab() as unknown as TestableTab;

    await expect(tab._prepareContext({})).resolves.toMatchObject({
      canManage: false,
    });
  });

  it("does not invoke mutation operations for a non-GM", async () => {
    vi.stubGlobal("game", {
      i18n: { localize: (key: string) => key },
      user: { isGM: false },
    });
    const { NarrativeSidebarTab } = await loadSidebarModule();
    const tab = new NarrativeSidebarTab();
    const startAction = NarrativeSidebarTab.DEFAULT_OPTIONS.actions
      .startNarrativeScene as unknown as Action;
    const endAction = NarrativeSidebarTab.DEFAULT_OPTIONS.actions
      .endNarrativeScene as unknown as Action;

    await startAction.call(
      tab as unknown as InstanceType<typeof FakeAbstractSidebarTab>,
      {} as PointerEvent,
      new FakeButtonElement() as unknown as HTMLElement,
    );
    await endAction.call(
      tab as unknown as InstanceType<typeof FakeAbstractSidebarTab>,
      {} as PointerEvent,
      new FakeButtonElement() as unknown as HTMLElement,
    );

    expect(operations.start).not.toHaveBeenCalled();
    expect(operations.end).not.toHaveBeenCalled();
  });

  it("passes the form name to the existing start operation", async () => {
    const { NarrativeSidebarTab } = await loadSidebarModule();
    const tab = new NarrativeSidebarTab();
    const button = new FakeButtonElement();
    button.form = {
      elements: {
        namedItem: () => new FakeInputElement("  Laboratório  "),
      },
    };
    const action = NarrativeSidebarTab.DEFAULT_OPTIONS.actions
      .startNarrativeScene as unknown as Action;

    await action.call(
      tab as unknown as InstanceType<typeof FakeAbstractSidebarTab>,
      {} as PointerEvent,
      button as unknown as HTMLElement,
    );

    expect(operations.start).toHaveBeenCalledWith("  Laboratório  ");
  });

  it("reports an empty name rejected by the existing start operation", async () => {
    operations.start.mockResolvedValue({ status: "invalid-name" });
    const { NarrativeSidebarTab } = await loadSidebarModule();
    const tab = new NarrativeSidebarTab();
    const button = new FakeButtonElement();
    button.form = {
      elements: { namedItem: () => new FakeInputElement("   ") },
    };
    const action = NarrativeSidebarTab.DEFAULT_OPTIONS.actions
      .startNarrativeScene as unknown as Action;

    await action.call(
      tab as unknown as InstanceType<typeof FakeAbstractSidebarTab>,
      {} as PointerEvent,
      button as unknown as HTMLElement,
    );

    expect(operations.start).toHaveBeenCalledWith("   ");
    expect(ui.notifications.warn).toHaveBeenCalledWith(
      "ORDEMPARANORMAL2.NarrativeScene.Errors.InvalidName",
    );
  });

  it("ends with the ID rendered in the active tab", async () => {
    const { NarrativeSidebarTab } = await loadSidebarModule();
    const tab = new NarrativeSidebarTab();
    const button = new FakeButtonElement();
    button.dataset.sceneId = "scene-shown";
    const action = NarrativeSidebarTab.DEFAULT_OPTIONS.actions
      .endNarrativeScene as unknown as Action;

    await action.call(
      tab as unknown as InstanceType<typeof FakeAbstractSidebarTab>,
      {} as PointerEvent,
      button as unknown as HTMLElement,
    );

    expect(operations.end).toHaveBeenCalledWith("scene-shown");
  });

  it("reports stale end results without performing another mutation", async () => {
    operations.end.mockResolvedValue({
      status: "stale",
      scene: { id: "scene-new", name: "Nova" },
    });
    const { NarrativeSidebarTab } = await loadSidebarModule();
    const tab = new NarrativeSidebarTab();
    const button = new FakeButtonElement();
    button.dataset.sceneId = "scene-old";
    const action = NarrativeSidebarTab.DEFAULT_OPTIONS.actions
      .endNarrativeScene as unknown as Action;

    await action.call(
      tab as unknown as InstanceType<typeof FakeAbstractSidebarTab>,
      {} as PointerEvent,
      button as unknown as HTMLElement,
    );

    expect(operations.end).toHaveBeenCalledOnce();
    expect(ui.notifications.warn).toHaveBeenCalledWith(
      "ORDEMPARANORMAL2.NarrativeScene.Errors.Stale",
    );
  });

  it("rerenders both the sidebar instance and its rendered popout", async () => {
    const { NarrativeSidebarTab, synchronizeNarrativeSidebarTabs } =
      await loadSidebarModule();
    const sidebar = new NarrativeSidebarTab() as unknown as TestableTab;
    const popout = new NarrativeSidebarTab() as unknown as TestableTab;
    await sidebar._onRender({}, {});
    await popout._onRender({}, {});

    await synchronizeNarrativeSidebarTabs();

    expect(sidebar.render).toHaveBeenCalledOnce();
    expect(popout.render).toHaveBeenCalledOnce();
  });
});
