import { afterEach, describe, expect, it, vi } from "vitest";

import { registerActorDefaults } from "./register-actor-defaults";

afterEach(() => vi.unstubAllGlobals());

const FRIENDLY = 1;
const HOSTILE = -1;
const OWNER_HOVER = 20;

function captureHook() {
  let callback: ((document: unknown, data: unknown) => unknown) | undefined;
  vi.stubGlobal("CONST", {
    TOKEN_DISPOSITIONS: { FRIENDLY, HOSTILE },
    TOKEN_DISPLAY_MODES: { OWNER_HOVER },
  });
  vi.stubGlobal("Hooks", {
    on: vi.fn((_name: string, registered: typeof callback) => {
      callback = registered;
    }),
  });
  registerActorDefaults();
  if (!callback) throw new Error("hook not registered");
  return callback;
}

function actor(type: string) {
  const updateSource = vi.fn();
  return {
    document: { type, prototypeToken: { updateSource } },
    updateSource,
  };
}

describe("Actor prototype Token defaults", () => {
  it("gives a new threat independent PV and keeps explicitly supplied token settings", () => {
    const callback = captureHook();
    const { document, updateSource } = actor("threat");
    callback(document, {});
    expect(updateSource).toHaveBeenCalledWith({
      actorLink: false, disposition: HOSTILE, displayBars: OWNER_HOVER,
      bar1: { attribute: "resources.health" }, bar2: { attribute: null },
    });
    callback(document, { prototypeToken: {
      actorLink: true, disposition: 0, displayBars: 0, bar1: { attribute: null }, bar2: { attribute: "custom" },
    } });
    expect(updateSource).toHaveBeenCalledOnce();
  });
  it("does not alter Actors that are not Agents", () => {
    const callback = captureHook();
    const { document, updateSource } = actor("other");

    callback(document, {});

    expect(updateSource).not.toHaveBeenCalled();
  });

  it("applies every default to an Agent without explicit Token configuration", () => {
    const callback = captureHook();
    const { document, updateSource } = actor("agent");

    callback(document, {});

    expect(updateSource).toHaveBeenCalledOnce();
    expect(updateSource).toHaveBeenCalledWith({
      actorLink: true,
      disposition: FRIENDLY,
      displayBars: OWNER_HOVER,
      sight: { enabled: true, range: 0 },
    });
  });

  it("preserves explicit values individually while defaulting absent fields", () => {
    const callback = captureHook();
    const { document, updateSource } = actor("agent");

    callback(document, {
      prototypeToken: {
        actorLink: false,
        disposition: null,
        displayBars: 0,
      },
    });

    expect(updateSource).toHaveBeenCalledOnce();
    expect(updateSource).toHaveBeenCalledWith({
      sight: { enabled: true, range: 0 },
    });
  });

  it("defaults sight members independently without replacing other sight data", () => {
    const callback = captureHook();
    const { document, updateSource } = actor("agent");

    callback(document, {
      prototypeToken: {
        actorLink: true,
        disposition: 0,
        displayBars: 50,
        sight: {
          enabled: false,
          angle: 180,
          visionMode: "basic",
        },
      },
    });

    expect(updateSource).toHaveBeenCalledOnce();
    expect(updateSource).toHaveBeenCalledWith({
      sight: { range: 0 },
    });
  });

  it("preserves an explicit sight range while defaulting sight enabled", () => {
    const callback = captureHook();
    const { document, updateSource } = actor("agent");

    callback(document, {
      prototypeToken: {
        actorLink: true,
        disposition: 1,
        displayBars: 20,
        sight: { range: 12 },
      },
    });

    expect(updateSource).toHaveBeenCalledOnce();
    expect(updateSource).toHaveBeenCalledWith({
      sight: { enabled: true },
    });
  });
});
