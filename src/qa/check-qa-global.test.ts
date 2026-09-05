import { afterEach, describe, expect, it, vi } from "vitest";

import {
  registerCheckQaGlobal,
  removeCheckQaGlobal,
  synchronizeCheckQaGlobal,
} from "./check-qa-global";
import { publishCheckScenario } from "./check-scenarios";

type TestQaGlobal = typeof globalThis & {
  ordemparanormal2Qa?: Record<string, unknown>;
};

function getQaGlobal(): Record<string, unknown> | undefined {
  return (globalThis as TestQaGlobal).ordemparanormal2Qa;
}

function stubDebugState(debugMode: boolean, isGM: boolean): void {
  vi.stubGlobal("game", {
    settings: { get: vi.fn(() => debugMode) },
    user: { isGM },
  });
}

afterEach(() => {
  Reflect.deleteProperty(globalThis, "ordemparanormal2Qa");
  vi.unstubAllGlobals();
});

describe("Check QA global", () => {
  it("is absent while Debug Mode is false", () => {
    registerCheckQaGlobal();
    stubDebugState(false, true);

    synchronizeCheckQaGlobal();

    expect(getQaGlobal()).toBeUndefined();
  });

  it("registers exactly the approved API for an enabled GM", () => {
    stubDebugState(true, true);

    synchronizeCheckQaGlobal();

    const qaGlobal = getQaGlobal();
    expect(qaGlobal).toEqual({ publishCheckScenario });
    expect(Object.keys(qaGlobal ?? {})).toEqual(["publishCheckScenario"]);
    expect(Object.isFrozen(qaGlobal)).toBe(true);
  });

  it("does not register for a non-GM even when enabled", () => {
    stubDebugState(true, false);

    synchronizeCheckQaGlobal();

    expect(getQaGlobal()).toBeUndefined();
  });

  it("deletes the global instead of leaving an inert object", () => {
    registerCheckQaGlobal();

    removeCheckQaGlobal();

    expect(getQaGlobal()).toBeUndefined();
    expect(Object.hasOwn(globalThis, "ordemparanormal2Qa")).toBe(false);
  });
});
