import { afterEach, describe, expect, it, vi } from "vitest";

import { showDiceAnimationIfAvailable } from "./show-dice-animation-if-available";

const roll = { formula: "1d8 + 1d6" } as foundry.dice.Roll;
const user = { id: "player" } as foundry.documents.User;

function createVisibilityDocument(initialState: DocumentVisibilityState) {
  let visibilityState = initialState;
  let listener: (() => void) | undefined;
  const visibilityDocument = {
    get visibilityState() {
      return visibilityState;
    },
    addEventListener: vi.fn((_type: string, callback: () => void) => {
      listener = callback;
    }),
    removeEventListener: vi.fn((_type: string, callback: () => void) => {
      if (listener === callback) listener = undefined;
    }),
  } as unknown as Document;

  return {
    visibilityDocument,
    hide: () => {
      visibilityState = "hidden";
      listener?.();
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("optional Dice So Nice animation", () => {
  it("resolves immediately when Dice So Nice is absent", async () => {
    const get = vi.fn(() => undefined);
    vi.stubGlobal("game", { modules: { get }, user });

    await expect(showDiceAnimationIfAvailable(roll)).resolves.toBeUndefined();

    expect(get).toHaveBeenCalledExactlyOnceWith("dice-so-nice");
  });

  it("does not call the API when Dice So Nice is inactive", async () => {
    const showForRoll = vi.fn();
    vi.stubGlobal("game", {
      dice3d: { showForRoll },
      modules: { get: vi.fn(() => ({ active: false })) },
      user,
    });

    await showDiceAnimationIfAvailable(roll);

    expect(showForRoll).not.toHaveBeenCalled();
  });

  it("uses the evaluated Roll, native synchronization, and waits for completion", async () => {
    let finishAnimation: ((displayed: boolean) => void) | undefined;
    const animation = new Promise<boolean>((resolve) => {
      finishAnimation = resolve;
    });
    const showForRoll = vi.fn(() => animation);
    const { visibilityDocument } = createVisibilityDocument("visible");
    vi.stubGlobal("document", visibilityDocument);
    vi.stubGlobal("game", {
      dice3d: { showForRoll },
      modules: { get: vi.fn(() => ({ active: true })) },
      user,
    });

    let completed = false;
    const pending = showDiceAnimationIfAvailable(roll).then(() => {
      completed = true;
    });

    expect(showForRoll).toHaveBeenCalledExactlyOnceWith(
      roll,
      user,
      true,
      null,
      false,
    );
    expect(completed).toBe(false);

    finishAnimation?.(true);
    await pending;
    expect(completed).toBe(true);
    expect(visibilityDocument.removeEventListener).toHaveBeenCalledOnce();
  });

  it("stops waiting and removes its listener when the document becomes hidden", async () => {
    let finishAnimation: ((displayed: boolean) => void) | undefined;
    const animation = new Promise<boolean>((resolve) => {
      finishAnimation = resolve;
    });
    const { visibilityDocument, hide } = createVisibilityDocument("visible");
    vi.stubGlobal("document", visibilityDocument);
    vi.stubGlobal("game", {
      dice3d: { showForRoll: vi.fn(() => animation) },
      modules: { get: vi.fn(() => ({ active: true })) },
      user,
    });

    let completed = false;
    const pending = showDiceAnimationIfAvailable(roll).then(() => {
      completed = true;
    });
    await Promise.resolve();
    expect(completed).toBe(false);

    hide();
    await pending;

    expect(completed).toBe(true);
    expect(visibilityDocument.removeEventListener).toHaveBeenCalledOnce();
    finishAnimation?.(true);
  });

  it("does not block or register a listener when the document starts hidden", async () => {
    const animation = new Promise<boolean>(() => undefined);
    const { visibilityDocument } = createVisibilityDocument("hidden");
    const showForRoll = vi.fn(() => animation);
    vi.stubGlobal("document", visibilityDocument);
    vi.stubGlobal("game", {
      dice3d: { showForRoll },
      modules: { get: vi.fn(() => ({ active: true })) },
      user,
    });

    await expect(showDiceAnimationIfAvailable(roll)).resolves.toBeUndefined();

    expect(showForRoll).toHaveBeenCalledOnce();
    expect(visibilityDocument.addEventListener).not.toHaveBeenCalled();
  });

  it("settles and cleans up once when animation and visibility race", async () => {
    let finishAnimation: ((displayed: boolean) => void) | undefined;
    const animation = new Promise<boolean>((resolve) => {
      finishAnimation = resolve;
    });
    const { visibilityDocument, hide } = createVisibilityDocument("visible");
    vi.stubGlobal("document", visibilityDocument);
    vi.stubGlobal("game", {
      dice3d: { showForRoll: vi.fn(() => animation) },
      modules: { get: vi.fn(() => ({ active: true })) },
      user,
    });
    let completionCount = 0;

    const pending = showDiceAnimationIfAvailable(roll).then(() => {
      completionCount += 1;
    });
    finishAnimation?.(true);
    hide();
    await pending;
    await Promise.resolve();

    expect(completionCount).toBe(1);
    expect(visibilityDocument.removeEventListener).toHaveBeenCalledOnce();
  });

  it("logs a warning and preserves the roll when the animation fails", async () => {
    const error = new Error("renderer unavailable");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { visibilityDocument } = createVisibilityDocument("visible");
    vi.stubGlobal("document", visibilityDocument);
    vi.stubGlobal("game", {
      dice3d: { showForRoll: vi.fn().mockRejectedValue(error) },
      modules: { get: vi.fn(() => ({ active: true })) },
      user,
    });

    await expect(showDiceAnimationIfAvailable(roll)).resolves.toBeUndefined();

    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("continuing with the resolved Check"),
      error,
    );
    expect(visibilityDocument.removeEventListener).toHaveBeenCalledOnce();
  });
});
