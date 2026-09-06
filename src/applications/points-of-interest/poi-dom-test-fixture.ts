// Minimal DOM surface used by the POI boundary tests; runtime behavior is smoke-tested in Foundry.
export class PoiTestElement extends EventTarget {
  children: PoiTestElement[] = [];
  parent?: PoiTestElement;
  className = "";
  textContent = "";
  value = "";
  disabled = false;
  hidden = false;
  checked = false;
  selected = false;
  type = "";
  size = 0;
  style: Record<string, string> = {};
  constructor(readonly tagName = "div") { super(); }
  setAttribute(): void {}
  contains(node: unknown): boolean {
    return node === this || this.children.some(child => child.contains(node));
  }
  append(...children: PoiTestElement[]): void {
    for (const child of children) { child.remove(); child.parent = this; this.children.push(child); }
  }
  prepend(child: PoiTestElement): void { child.remove(); child.parent = this; this.children.unshift(child); }
  remove(): void { if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this); }
  replaceChildren(...children: PoiTestElement[]): void { this.children = []; this.append(...children); }
  replaceWith(child: PoiTestElement): void { const parent = this.parent; this.remove(); parent?.append(child); }
  querySelector(selector: string): PoiTestElement | undefined { return this.find(element => element.className === selector.slice(1)); }
  find(predicate: (element: PoiTestElement) => boolean): PoiTestElement | undefined {
    for (const child of this.children) { if (predicate(child)) return child; const nested = child.find(predicate); if (nested) return nested; }
  }
  click(): void { if (!this.disabled) this.dispatchEvent(new Event("click")); }
}
export const poiTestDocument = { createElement: (tag: string) => new PoiTestElement(tag) };
export const flushPoiTasks = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
