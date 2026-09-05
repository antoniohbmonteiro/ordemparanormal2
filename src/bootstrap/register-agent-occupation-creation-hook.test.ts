import { afterEach, describe, expect, it, vi } from "vitest";

import { registerAgentOccupationCreationHook } from "./register-agent-occupation-creation-hook";

afterEach(() => vi.unstubAllGlobals());

function captureHook() {
  let callback: ((document: unknown, data: unknown) => unknown) | undefined;
  vi.stubGlobal("Hooks", {
    on: vi.fn((_name: string, registered: typeof callback) => {
      callback = registered;
    }),
  });
  const error = vi.fn();
  vi.stubGlobal("ui", { notifications: { error } });
  vi.stubGlobal("game", { i18n: { localize: (key: string) => key } });
  registerAgentOccupationCreationHook();
  if (!callback) throw new Error("hook not registered");
  return { callback, error };
}

describe("Agent Occupation preCreateActor hook", () => {
  it("updates a valid pending source exactly once", () => {
    const { callback } = captureHook();
    const updateSource = vi.fn();
    const actor = { id: null, name: "Novo", type: "agent", updateSource };
    const source = { system: { occupation: "Pesquisador" }, items: [] };

    expect(callback(actor, source)).toBeUndefined();
    expect(updateSource).toHaveBeenCalledTimes(1);
    expect(updateSource).toHaveBeenCalledWith({
      "system.occupation": "",
      items: [
        {
          name: "Pesquisador",
          img: "icons/svg/item-bag.svg",
          type: "occupation",
          system: {},
        },
      ],
    });
  });

  it("cancels creation without mutation when the legacy flag conflicts", () => {
    const { callback, error } = captureHook();
    const updateSource = vi.fn();
    const actor = { id: null, name: "Importado", type: "agent", updateSource };
    const source = {
      system: { occupation: "Pesquisador" },
      items: [{ type: "occupation", name: "Piloto" }],
      flags: {
        ordemparanormal2: {
          legacyOccupation: { value: "Analista", migrationVersion: 1 },
        },
      },
    };

    expect(callback(actor, source)).toBe(false);
    expect(updateSource).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledWith(
      "ORDEMPARANORMAL2.Migrations.Occupation.CreationConflict",
    );
  });
});
