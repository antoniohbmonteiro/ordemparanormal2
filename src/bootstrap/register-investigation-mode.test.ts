import { afterEach, expect, it, vi } from "vitest";
import type { SceneControl } from "@client/applications/ui/scene-controls.mjs";

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

it("registers once in init and synchronizes keybind, toggle and rebuilds without activation", async () => {
  const { registerInvestigationMode } = await import("./register-investigation-mode");
  const { investigationMode } = await import("../adapters/foundry/points-of-interest/investigation-mode");
  const { addPoiSceneControls } = await import("../adapters/foundry/points-of-interest/poi-scene-controls");
  const register = vi.fn();
  vi.stubGlobal("game", { user: { isGM: false }, keybindings: { register },
    i18n: { localize: (key: string) => key } });
  // Players must not need the Foundry canvas namespace to prepare their toggle.
  vi.stubGlobal("foundry", undefined);
  const controls: Record<string, SceneControl> = {};
  addPoiSceneControls(controls);
  const render = vi.fn();
  const tokens = { name: "tokens" }; const select = { name: "select" };
  const host = { controls, render, control: tokens, tool: select,
    get activate() { throw new Error("Mode must not activate Scene Controls"); } };
  vi.stubGlobal("ui", { controls: host });
  registerInvestigationMode();
  expect(register).toHaveBeenCalledOnce();
  const [namespace, name, binding] = register.mock.calls[0];
  expect([namespace, name]).toEqual(["ordemparanormal2", "investigationMode"]);
  expect(binding).toMatchObject({ editable: [{ key: "KeyI" }], repeat: false, restricted: false });
  expect(binding.onDown()).toBe(true);
  expect(investigationMode.get()).toBe(true);
  expect(controls["ordemparanormal2-poi"].tools.investigationMode.active).toBe(true);
  expect(render).toHaveBeenCalledOnce();
  addPoiSceneControls(controls);
  const toggle = controls["ordemparanormal2-poi"].tools.investigationMode;
  expect(toggle.active).toBe(true);
  toggle.active = false; // Foundry updates this before the public callback.
  toggle.onChange!(new Event("change"), false);
  expect(investigationMode.get()).toBe(false);
  expect(render).toHaveBeenCalledOnce();
  expect(host.control).toBe(tokens); expect(host.tool).toBe(select);
});
