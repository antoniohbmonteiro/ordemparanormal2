import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const instances: MockGmToolsPalette[] = [];
let onRender: ((application: MockGmToolsPalette) => Promise<void>) | null = null;

class MockGmToolsPalette {
  readonly render = vi.fn(async () => {
    await onRender?.(this);
    return this;
  });
  readonly listeners = new Map<string, { listener: (event: Event) => unknown; once: boolean }[]>();

  constructor() {
    instances.push(this);
  }

  addEventListener(
    type: string,
    listener: (event: Event) => unknown,
    options?: { once?: boolean },
  ): void {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push({ listener, once: options?.once ?? false });
    this.listeners.set(type, listeners);
  }

  emit(type: string): void {
    const event = new Event(type);
    const listeners = this.listeners.get(type) ?? [];
    for (const { listener } of listeners) listener(event);
    this.listeners.set(type, listeners.filter(({ once }) => !once));
  }
}

vi.mock("./gm-tools-palette", () => ({ GmToolsPalette: MockGmToolsPalette }));

let controller: typeof import("./gm-tools-palette-controller");

beforeAll(async () => {
  vi.stubGlobal("game", { user: { isGM: true } });
  controller = await import("./gm-tools-palette-controller");
});

beforeEach(() => {
  vi.stubGlobal("game", { user: { isGM: true } });
  for (const instance of instances) instance.emit("close");
  instances.length = 0;
  onRender = null;
});

afterEach(() => vi.unstubAllGlobals());
afterAll(() => vi.unstubAllGlobals());

describe("GM Tools Palette controller", () => {
  it("registers one instance before its first render", async () => {
    let synchronizedAgain = false;
    onRender = async () => {
      await controller.synchronizeGmToolsPalette();
      synchronizedAgain = true;
    };

    await controller.synchronizeGmToolsPalette();

    expect(synchronizedAgain).toBe(true);
    expect(instances).toHaveLength(1);
    expect(instances[0].render).toHaveBeenCalledExactlyOnceWith({ force: true });
  });

  it("does not duplicate the palette across repeated synchronization", async () => {
    await controller.synchronizeGmToolsPalette();
    await controller.synchronizeGmToolsPalette();

    expect(instances).toHaveLength(1);
    expect(instances[0].render).toHaveBeenCalledOnce();
  });

  it("can synchronize again after an external close", async () => {
    await controller.synchronizeGmToolsPalette();
    instances[0].emit("close");
    await controller.synchronizeGmToolsPalette();

    expect(instances).toHaveLength(2);
  });

  it("is inert for a non-GM", async () => {
    vi.stubGlobal("game", { user: { isGM: false } });

    await controller.synchronizeGmToolsPalette();

    expect(instances).toHaveLength(0);
  });
});
