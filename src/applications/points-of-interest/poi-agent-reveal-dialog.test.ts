import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { PoiTestElement, flushPoiTasks, poiTestDocument } from "./poi-dom-test-fixture";
import { openPoiAgentRevealDialog } from "./poi-agent-reveal-dialog";

interface StubButton { action: string; callback?: () => unknown }

class DialogStub extends EventTarget {
  static latest: DialogStub;
  window = { content: new PoiTestElement() };
  constructor(readonly options: { content: PoiTestElement; buttons: StubButton[] }) {
    super();
    if (options.content.className) throw new Error("config.content element must have no attributes");
    DialogStub.latest = this;
    const mount = new PoiTestElement();
    mount.className = "op2-poi-agent-dialog-mount";
    this.window.content.append(mount);
  }
  async render(): Promise<void> { this.dispatchEvent(new Event("render")); }
}

beforeEach(() => {
  const actors = [{ id: "a", uuid: "Actor.a", type: "agent", name: "Alan" },
    { id: "b", uuid: "Actor.b", type: "agent", name: "Bia" }];
  vi.stubGlobal("document", { ...poiTestDocument,
    createTextNode: (text: string) => { const node = new PoiTestElement("text"); node.textContent = text; return node; } });
  vi.stubGlobal("game", { scenes: { get: () => ({ tokens: [{ actorId: "a" }] }) },
    actors: { contents: actors }, i18n: { localize: (key: string) => key } });
  vi.stubGlobal("foundry", { applications: { api: { DialogV2: DialogStub } } });
});
afterEach(() => vi.unstubAllGlobals());

it("opens with an attribute-free DialogV2 root and returns only the chosen Agent", async () => {
  const result = openPoiAgentRevealDialog("scene");
  await flushPoiTasks();
  const content = DialogStub.latest.window.content.find(node => node.className === "op2-poi-agent-dialog")!;
  const boxes = content.children.filter(node => node.tagName === "label").map(row => row.children[0]);
  content.children[0].click();
  expect(boxes.map(box => box.checked)).toEqual([true, false]);
  boxes[0].checked = false;
  boxes[1].checked = true;
  DialogStub.latest.options.buttons.find(button => button.action === "confirm")!.callback!();
  expect(await result).toEqual(["Actor.b"]);
});

it("returns no selection when canceled", async () => {
  const result = openPoiAgentRevealDialog("scene");
  await flushPoiTasks();
  DialogStub.latest.dispatchEvent(new Event("close"));
  expect(await result).toBeNull();
});
