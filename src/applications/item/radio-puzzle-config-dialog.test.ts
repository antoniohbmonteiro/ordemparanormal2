import { afterEach, expect, it, vi } from "vitest";
import { editRadioPuzzle } from "./radio-puzzle-config-dialog";
import type { RadioPuzzleConfig } from "../../core/equipment/radio-puzzle";
afterEach(() => vi.unstubAllGlobals());
it("edits escaped fragments locally, validates duplicates and preserves the source until Save", async () => {
  const initial: RadioPuzzleConfig = { type: "radio", trueFragments: ["A", "B"], falseFragments: ["<ruído>"] };
  class Element {
    disabled = false; dataset: Record<string, string> = {}; value = "";
    closest() { return this; }
  }
  const lists = { trueFragments: { innerHTML: "" }, falseFragments: { innerHTML: "" } };
  const preview = { textContent: "" }, error = { textContent: "" }, save = { disabled: true };
  const handlers: Record<string, (event: { target: Element; preventDefault(): void }) => void> = {};
  const root = { querySelector: (selector: string) => selector === "[data-radio-preview]" ? preview
    : selector === "[data-radio-error]" ? error : lists[selector.includes("trueFragments") ? "trueFragments" : "falseFragments"],
    addEventListener: (name: string, listener: typeof handlers[string]) => { handlers[name] = listener; } };
  let options!: { render(event: unknown, dialog: unknown): void; ok: { callback(): RadioPuzzleConfig } };
  vi.stubGlobal("Element", Element); vi.stubGlobal("HTMLInputElement", Element);
  vi.stubGlobal("game", { i18n: { localize: (key: string) => key } });
  vi.stubGlobal("foundry", { utils: { escapeHTML: (text: string) => text.replaceAll("<", "&lt;").replaceAll(">", "&gt;") },
    applications: { handlebars: { renderTemplate: async () => "template" }, api: { DialogV2: {
      input: vi.fn(async value => { options = value; return null; }) } } } });
  expect(await editRadioPuzzle(initial)).toBeNull();
  options.render({}, { element: { querySelector: (selector: string) => selector === ".op2-radio-config" ? root : save } });
  expect(save.disabled).toBe(false); expect(lists.falseFragments.innerHTML).toContain("&lt;ruído&gt;");
  const edit = (kind: string, index: number, value: string) => {
    const target = new Element(); target.dataset = { kind, index: String(index) }; target.value = value;
    handlers.input({ target, preventDefault() {} });
  };
  edit("falseFragments", 0, " A "); expect(save.disabled).toBe(true); expect(error.textContent).toContain("InvalidPuzzle");
  expect(() => options.ok.callback()).toThrow();
  edit("falseFragments", 0, " Outra "); expect(save.disabled).toBe(false);
  const target = new Element(); target.dataset = { kind: "trueFragments", index: "1", radioEdit: "up" };
  handlers.click({ target, preventDefault() {} }); expect(preview.textContent).toBe("B A");
  expect(options.ok.callback()).toEqual({ type: "radio", trueFragments: ["B", "A"], falseFragments: ["Outra"] });
  expect(initial).toEqual({ type: "radio", trueFragments: ["A", "B"], falseFragments: ["<ruído>"] });
  edit("trueFragments", 0, " "); expect(save.disabled).toBe(true);
});
