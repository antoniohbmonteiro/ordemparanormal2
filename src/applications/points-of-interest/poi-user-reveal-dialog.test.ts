import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PoiTestElement, poiTestDocument, flushPoiTasks } from "./poi-dom-test-fixture";
import { openPoiUserRevealDialog } from "./poi-user-reveal-dialog";

const { listPlayerUsers } = vi.hoisted(() => ({ listPlayerUsers: vi.fn() }));
vi.mock("../../adapters/foundry/users/list-player-users", () => ({ listPlayerUsers }));

interface StubButton { action: string; label: string; callback?: () => unknown }

class DialogStub extends EventTarget {
  static latest: DialogStub;
  window = { content: new PoiTestElement() };
  constructor(readonly options: { content: PoiTestElement; buttons: StubButton[] }) {
    super();
    DialogStub.latest = this;
    const mount = new PoiTestElement();
    mount.className = "op2-poi-reveal-dialog-mount";
    this.window.content.append(mount);
  }
  async render(): Promise<void> { this.dispatchEvent(new Event("render")); }
  close = vi.fn(async () => { this.dispatchEvent(new Event("close")); });
}

const confirm = () => DialogStub.latest.options.buttons.find(button => button.action === "confirm")!.callback!();
const checkboxes = () => DialogStub.latest.window.content
  .find(el => el.className === "op2-poi-reveal-dialog")!.children
  .filter(row => row.tagName === "label")
  .map(row => row.children[0]);

beforeEach(() => {
  listPlayerUsers.mockReset().mockReturnValue([
    { id: "p1", name: "Player One" },
    { id: "p2", name: "Player Two" },
  ]);
  vi.stubGlobal("document", poiTestDocument);
  vi.stubGlobal("game", { i18n: { localize: (key: string) => key } });
  vi.stubGlobal("foundry", { applications: { api: { DialogV2: DialogStub } } });
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("POI user reveal dialog", () => {
  it("pre-checks the currently revealed users and returns the confirmed selection", async () => {
    const result = openPoiUserRevealDialog(["p2"]);
    await flushPoiTasks();
    expect(checkboxes().map(box => box.checked)).toEqual([false, true]);

    checkboxes()[0].checked = true;
    checkboxes()[1].checked = false;
    void confirm();
    expect(await result).toEqual(["p1"]);
  });

  it("resolves null when dismissed without confirming", async () => {
    const result = openPoiUserRevealDialog([]);
    await flushPoiTasks();
    DialogStub.latest.dispatchEvent(new Event("close"));
    expect(await result).toBeNull();
  });

  it("still opens with an empty-state message when there are no players", async () => {
    listPlayerUsers.mockReturnValue([]);
    const result = openPoiUserRevealDialog([]);
    await flushPoiTasks();
    expect(checkboxes()).toHaveLength(0);
    void confirm();
    expect(await result).toEqual([]);
  });
});
