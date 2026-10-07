import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const instances: MockGmToolkit[] = [];
let onRender: ((application: MockGmToolkit) => Promise<void>) | null = null;

class MockGmToolkit {
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

vi.mock("./gm-toolkit", () => ({ GmToolkit: MockGmToolkit }));

let controller: typeof import("./gm-toolkit-controller");

beforeAll(async () => {
  vi.stubGlobal("game", { user: { isGM: true } });
  controller = await import("./gm-toolkit-controller");
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
      await controller.synchronizeGmToolkit();
      synchronizedAgain = true;
    };

    await controller.synchronizeGmToolkit();

    expect(synchronizedAgain).toBe(true);
    expect(instances).toHaveLength(1);
    expect(instances[0].render).toHaveBeenCalledExactlyOnceWith({ force: true });
  });

  it("does not duplicate the palette across repeated synchronization", async () => {
    await controller.synchronizeGmToolkit();
    await controller.synchronizeGmToolkit();

    expect(instances).toHaveLength(1);
    expect(instances[0].render).toHaveBeenCalledOnce();
  });

  it("can synchronize again after an external close", async () => {
    await controller.synchronizeGmToolkit();
    instances[0].emit("close");
    await controller.synchronizeGmToolkit();

    expect(instances).toHaveLength(2);
  });

  it("is inert for a non-GM", async () => {
    vi.stubGlobal("game", { user: { isGM: false } });

    await controller.synchronizeGmToolkit();

    expect(instances).toHaveLength(0);
  });
});
