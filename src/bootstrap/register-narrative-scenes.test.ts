import { beforeEach, describe, expect, it, vi } from "vitest";

const setting = vi.hoisted(() => ({
  deserialize: vi.fn(),
  get: vi.fn(),
  register: vi.fn(),
}));
const sidebarRegistration = vi.hoisted(() => ({ register: vi.fn() }));
const hud = vi.hoisted(() => ({ synchronize: vi.fn() }));
const sidebar = vi.hoisted(() => ({ synchronize: vi.fn() }));

vi.mock(
  "../adapters/foundry/narrative-scenes/narrative-scene-setting",
  () => ({
    deserializeNarrativeScene: setting.deserialize,
    getActiveNarrativeScene: setting.get,
    registerActiveNarrativeSceneSetting: setting.register,
  }),
);
vi.mock(
  "../adapters/foundry/narrative-scenes/register-narrative-sidebar-tab",
  () => ({ registerNarrativeSidebarTab: sidebarRegistration.register }),
);
vi.mock("../applications/narrative-scenes/narrative-sidebar-tab", () => ({
  synchronizeNarrativeSidebarTabs: sidebar.synchronize,
}));
vi.mock("../applications/narrative-scenes/narrative-scene-hud", () => ({
  synchronizeNarrativeSceneHud: hud.synchronize,
}));

import {
  handleNarrativeSceneSettingChange,
  initializeNarrativeScenes,
  registerNarrativeScenes,
} from "./register-narrative-scenes";

const error = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("game", {
    i18n: { localize: (key: string) => key },
    user: { isGM: true },
  });
  vi.stubGlobal("ui", { notifications: { error } });
  setting.deserialize.mockReturnValue({ id: "scene-1", name: "Lab" });
  setting.get.mockReturnValue({ id: "scene-1", name: "Lab" });
  hud.synchronize.mockResolvedValue(undefined);
  sidebar.synchronize.mockResolvedValue(undefined);
});

describe("Narrative Scene bootstrap", () => {
  it("registers the setting, sidebar tab, and ready initialization", async () => {
    let ready: (() => void) | undefined;
    vi.stubGlobal("Hooks", {
      once: (hook: string, callback: () => void) => {
        if (hook === "ready") ready = callback;
      },
    });

    registerNarrativeScenes();

    expect(setting.register).toHaveBeenCalledWith(
      handleNarrativeSceneSettingChange,
    );
    expect(sidebarRegistration.register).toHaveBeenCalledOnce();
    ready?.();
    await vi.waitFor(() => expect(hud.synchronize).toHaveBeenCalledWith({
      id: "scene-1",
      name: "Lab",
    }));
  });

  it("deserializes onChange values before synchronizing the HUD and sidebar", async () => {
    await handleNarrativeSceneSettingChange('{"id":"scene-1","name":"Lab"}');

    expect(setting.deserialize).toHaveBeenCalledWith(
      '{"id":"scene-1","name":"Lab"}',
    );
    expect(hud.synchronize).toHaveBeenCalledWith({
      id: "scene-1",
      name: "Lab",
    });
    expect(sidebar.synchronize).toHaveBeenCalledOnce();
  });

  it("reads the persisted source of truth during ready initialization", async () => {
    await initializeNarrativeScenes();

    expect(setting.get).toHaveBeenCalledOnce();
    expect(hud.synchronize).toHaveBeenCalledWith({
      id: "scene-1",
      name: "Lab",
    });
  });

  it("reports malformed persisted state without overwriting it", async () => {
    setting.deserialize.mockImplementation(() => {
      throw new TypeError("invalid setting");
    });

    await handleNarrativeSceneSettingChange("invalid");

    expect(hud.synchronize).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledWith(
      "ORDEMPARANORMAL2.NarrativeScene.Errors.SynchronizationFailed",
    );
  });
});
