import { afterEach, describe, expect, it, vi } from "vitest";

import {
  DEBUG_MODE_SETTING_KEY,
  SYSTEM_ID,
} from "../config/system-config";

interface DebugSettingRegistration {
  readonly name: string;
  readonly hint: string;
  readonly scope: string;
  readonly config: boolean;
  readonly type: BooleanConstructor;
  readonly default: boolean;
  readonly onChange: (value: unknown) => void | Promise<void>;
}

type TestQaGlobal = typeof globalThis & {
  ordemparanormal2Qa?: unknown;
};

async function createHarness(options?: {
  readonly initial?: boolean;
  readonly isGM?: boolean;
  readonly confirmation?: boolean | null;
}) {
  let storedValue = options?.initial ?? false;
  let registration: DebugSettingRegistration | undefined;
  let readyCallback: (() => void) | undefined;
  const confirm = vi.fn().mockResolvedValue(options?.confirmation ?? false);
  const register = vi.fn(
    (_namespace: string, _key: string, data: DebugSettingRegistration) => {
      registration = data;
    },
  );
  const once = vi.fn((hook: string, callback: () => void) => {
    if (hook === "ready") readyCallback = callback;
  });
  const settings = {
    register,
    get: vi.fn(() => storedValue),
    set: vi.fn(async (_namespace: string, _key: string, value: unknown) => {
      storedValue = value === true;
      await registration?.onChange(value);
      return value;
    }),
  };

  vi.stubGlobal("game", {
    settings,
    user: { isGM: options?.isGM ?? true },
    i18n: { localize: vi.fn((key: string) => key) },
  });
  vi.stubGlobal("foundry", {
    applications: { api: { DialogV2: { confirm } } },
  });
  vi.stubGlobal("Hooks", { once });
  vi.resetModules();

  const module = await import("./register-debug-mode");
  module.registerDebugMode();

  if (!registration) throw new Error("Debug Mode setting was not registered.");

  return {
    ...module,
    confirm,
    register,
    registration,
    settings,
    getStoredValue: () => storedValue,
    runReady: () => readyCallback?.(),
  };
}

function hasQaGlobal(): boolean {
  return Object.hasOwn(globalThis, "ordemparanormal2Qa");
}

afterEach(() => {
  Reflect.deleteProperty(globalThis, "ordemparanormal2Qa");
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Debug Mode bootstrap", () => {
  it("registers a visible localized Boolean client setting defaulting to false", async () => {
    const harness = await createHarness();

    expect(harness.register).toHaveBeenCalledWith(
      SYSTEM_ID,
      DEBUG_MODE_SETTING_KEY,
      expect.objectContaining({
        name: "ORDEMPARANORMAL2.DebugMode.SettingName",
        hint: "ORDEMPARANORMAL2.DebugMode.SettingHint",
        scope: "client",
        config: true,
        type: Boolean,
        default: false,
      }),
    );
  });

  it("synchronizes the effective tool state on ready", async () => {
    const disabled = await createHarness({ initial: false });
    disabled.runReady();
    expect(hasQaGlobal()).toBe(false);

    const enabled = await createHarness({ initial: true, isGM: true });
    enabled.runReady();
    expect(hasQaGlobal()).toBe(true);
  });

  it("keeps the setting false and QA absent when confirmation is cancelled", async () => {
    const harness = await createHarness({ confirmation: false });

    await harness.registration.onChange(true);

    expect(harness.confirm).toHaveBeenCalledOnce();
    expect(harness.getStoredValue()).toBe(false);
    expect(hasQaGlobal()).toBe(false);
  });

  it("uses only localized content and button labels in the warning", async () => {
    const harness = await createHarness({ confirmation: false });

    await harness.registration.onChange(true);

    expect(harness.confirm).toHaveBeenCalledWith(
      expect.objectContaining({
        content: "ORDEMPARANORMAL2.DebugMode.Confirmation.Content",
        window: {
          title: "ORDEMPARANORMAL2.DebugMode.Confirmation.Title",
        },
        yes: expect.objectContaining({
          label: "ORDEMPARANORMAL2.DebugMode.Confirmation.Confirm",
        }),
        no: expect.objectContaining({
          label: "ORDEMPARANORMAL2.DebugMode.Confirmation.Cancel",
        }),
      }),
    );
  });

  it("enables immediately after one explicit confirmation for a GM", async () => {
    const harness = await createHarness({ confirmation: true, isGM: true });

    await harness.registration.onChange(true);

    expect(harness.confirm).toHaveBeenCalledOnce();
    expect(harness.settings.set).toHaveBeenNthCalledWith(
      1,
      SYSTEM_ID,
      DEBUG_MODE_SETTING_KEY,
      false,
    );
    expect(harness.settings.set).toHaveBeenNthCalledWith(
      2,
      SYSTEM_ID,
      DEBUG_MODE_SETTING_KEY,
      true,
    );
    expect(harness.getStoredValue()).toBe(true);
    expect(hasQaGlobal()).toBe(true);
  });

  it("keeps QA absent after confirmation for a non-GM", async () => {
    const harness = await createHarness({ confirmation: true, isGM: false });

    await harness.registration.onChange(true);

    expect(harness.getStoredValue()).toBe(true);
    expect(hasQaGlobal()).toBe(false);
  });

  it("disables immediately without asking for confirmation", async () => {
    const harness = await createHarness({ confirmation: true, isGM: true });
    await harness.registration.onChange(true);
    expect(hasQaGlobal()).toBe(true);
    harness.confirm.mockClear();

    await harness.registration.onChange(false);

    expect(harness.confirm).not.toHaveBeenCalled();
    expect(hasQaGlobal()).toBe(false);
  });

  it("does not reconfirm an already-enabled setting initialized on ready", async () => {
    const harness = await createHarness({ initial: true, isGM: true });
    harness.runReady();

    await harness.registration.onChange(true);

    expect(harness.confirm).not.toHaveBeenCalled();
    expect(hasQaGlobal()).toBe(true);
  });
});
