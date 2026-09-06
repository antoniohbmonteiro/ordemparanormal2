import { afterEach, describe, expect, it, vi } from "vitest";
import { investigationMode } from "./investigation-mode";

afterEach(() => investigationMode.set(false));

describe("client-local investigation mode", () => {
  it("starts OFF, notifies only changes and unsubscribes", () => {
    expect(investigationMode.get()).toBe(false);
    const listener = vi.fn();
    const stop = investigationMode.subscribe(listener);
    investigationMode.set(false);
    expect(listener).not.toHaveBeenCalled();
    investigationMode.toggle(); investigationMode.set(true);
    expect(investigationMode.get()).toBe(true);
    expect(listener).toHaveBeenCalledExactlyOnceWith(true);
    stop(); stop(); investigationMode.toggle();
    expect(listener).toHaveBeenCalledOnce();
    expect(investigationMode.get()).toBe(false);
  });
});
