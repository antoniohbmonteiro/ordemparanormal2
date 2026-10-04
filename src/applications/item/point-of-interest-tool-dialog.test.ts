import { afterEach, expect, it, vi } from "vitest";
const catalog = vi.hoisted(() => ({ load: vi.fn(), describe: vi.fn() }));
vi.mock("../../adapters/foundry/equipment/equipment-source", () => ({
  loadToolSources: catalog.load, describeToolApproach: catalog.describe,
}));
import { selectPoiApproach } from "./point-of-interest-approach-dialog";
import type { PointOfInterestApproach } from "../../documents/item/point-of-interest-data";
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

it("prepares whole branch replacements, clears forms on source change and revalidates source on confirmation", async () => {
  catalog.load.mockResolvedValue([
    { uuid: "Item.first", name: "Mesmo nome", origin: "Mundo", forms: [{ id: "scan", name: "Examinar" }] },
    { uuid: "Compendium.test.tools.Item.second", name: "Mesmo nome", origin: "Catálogo", forms: [{ id: "read", name: "Ler" }] },
  ]);
  catalog.describe.mockResolvedValue({ valid: true });
  class Select {
    value = ""; innerHTML = "";
    constructor(readonly name: string) {}
    addEventListener() {}
  }
  const fields = Object.fromEntries(["skill", "approachType", "equipmentUuid", "useFormId"].map(name => [name, new Select(name)]));
  const skillGroup = { hidden: false }, toolGroup = { hidden: false };
  let changed!: (event: { target: Select }) => void;
  const content = { querySelector: (selector: string) => selector === "[data-skill-fields]" ? skillGroup
    : selector === "[data-tool-fields]" ? toolGroup : fields[selector.match(/name="([^"]+)"/)?.[1] ?? ""] ?? null,
    addEventListener: (_name: string, handler: typeof changed) => { changed = handler; } };
  const add = { disabled: false };
  let options!: { content: string; render(event: unknown, dialog: unknown): void;
    ok: { callback(): Promise<PointOfInterestApproach> } };
  vi.stubGlobal("HTMLSelectElement", Select);
  vi.stubGlobal("game", { user: { isGM: true }, i18n: { localize: (key: string) => key } });
  vi.stubGlobal("foundry", { utils: { escapeHTML: (value: string) => value },
    applications: { api: { DialogV2: { input: vi.fn(async value => { options = value; return null; }) } } } });
  const original = { skill: "perception" as const, difficulty: 10, showDifficultyToPlayers: false };
  expect(await selectPoiApproach([], original)).toBeNull();
  options.render({}, { element: { querySelector: (selector: string) => selector === ".op2-poi-approach-dialog" ? content : add } });
  const change = (name: string, value: string) => { fields[name].value = value; changed({ target: fields[name] }); };
  change("approachType", "tool");
  expect(skillGroup.hidden).toBe(true);
  expect(toolGroup.hidden).toBe(false);
  expect(add.disabled).toBe(true);
  change("equipmentUuid", "Item.first");
  change("useFormId", "scan");
  expect(add.disabled).toBe(false);
  expect(await options.ok.callback()).toEqual({ type: "tool", equipmentUuid: "Item.first", useFormId: "scan" });
  change("equipmentUuid", "Compendium.test.tools.Item.second");
  expect(add.disabled).toBe(true);
  expect(fields.useFormId.innerHTML).toContain("Ler");
  expect(fields.useFormId.innerHTML).not.toContain("Examinar");
  change("useFormId", "read");
  catalog.describe.mockResolvedValueOnce({ valid: false });
  await expect(options.ok.callback()).rejects.toThrow("no longer available");
  expect(original).toEqual({ skill: "perception", difficulty: 10, showDifficultyToPlayers: false });
  expect(options.content).toContain("Mesmo nome — Mundo");
  expect(options.content).toContain("Mesmo nome — Catálogo");
});
