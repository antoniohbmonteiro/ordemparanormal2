import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { collectOwnedAbilities } from "./owned-abilities";
import { enrichAbilityDescriptions } from "./enrich-ability-descriptions";
import type { AbilityUseData } from "../../../core/abilities/ability-use";

const enrichHTML = vi.fn(async (html: string) => html);

beforeEach(() => {
  enrichHTML.mockReset().mockImplementation(async (html: string) => html);
  vi.stubGlobal("foundry", { applications: { ux: { TextEditor: { implementation: { enrichHTML } } } } });
  // This shim checks fragment presence, not native parsing or Foundry enrichment.
  vi.stubGlobal("document", { createElement: () => {
    const template = { innerHTML: "", get content() { return {
      textContent: template.innerHTML.replace(/<[^>]*>/g, ""),
      querySelector: () => /<(img|svg|video|audio|iframe|hr)\b/.test(template.innerHTML) ? {} : null,
    }; } };
    return template;
  } });
});
afterEach(() => vi.unstubAllGlobals());

function use(id: string, description = ""): AbilityUseData {
  return { id, name: id, description, cost: { source: "none", amount: 0 }, minimumLevel: null, checkIntegration: null };
}
function source(description = "", uses: readonly AbilityUseData[] = [], isOwner = true) {
  const ability = { id: "ability", type: "ability", name: "Habilidade", sort: 0, isOwner, system: { description, uses, resource: null } } as unknown as foundry.documents.Item;
  return { ability, view: collectOwnedAbilities([ability])[0]! };
}

describe("enriched Ability row descriptions", () => {
  it.each([true, false])("enriches the main and all form descriptions with relative document and owner secrets (%s)", async (isOwner) => {
    const integrated = { ...use("second", "@UUID[Item.second]"), minimumLevel: 7, checkIntegration: { modification: { type: "extraDie" as const, applicability: { type: "any" as const }, die: 6 as const } } };
    const { ability, view } = source("<p>Principal</p>", [use("first", "@UUID[Item.first]"), integrated], isOwner);
    const before = structuredClone(view);
    const content = await enrichAbilityDescriptions(ability, view);
    expect(enrichHTML).toHaveBeenCalledTimes(3);
    for (const [, options] of enrichHTML.mock.calls as unknown as Array<[string, object]>) {
      expect(options).toEqual({ relativeTo: ability, secrets: isOwner });
    }
    expect(content.descriptionHTML).toBe("<p>Principal</p>");
    expect(content.useForms.map(({ id, isCheckIntegrated }) => [id, isCheckIntegrated])).toEqual([["first", false], ["second", true]]);
    expect(view).toEqual(before);
  });

  it("skips blank descriptions while preserving the forms themselves", async () => {
    const { ability, view } = source("  ", [use("first"), use("second", " \n ")]);
    const content = await enrichAbilityDescriptions(ability, view);
    expect(enrichHTML).not.toHaveBeenCalled();
    expect(content.descriptionHTML).toBe("");
    expect(content.useForms.map(({ descriptionHTML }) => descriptionHTML)).toEqual(["", ""]);
  });

  it.each(["", "  ", "<p></p>", "<p><br></p>"])("omits content that enrichment leaves empty (%s)", async (html) => {
    enrichHTML.mockResolvedValue(html);
    const { ability, view } = source("secret", [use("first", "secret"), use("second")]);
    const content = await enrichAbilityDescriptions(ability, view);
    expect(content.descriptionHTML).toBe("");
    expect(content.useForms[0]?.descriptionHTML).toBe("");
  });

  it("preserves media-only descriptions", async () => {
    const { ability, view } = source('<img src="image.webp">');
    expect((await enrichAbilityDescriptions(ability, view)).descriptionHTML).toContain("image.webp");
  });

  it("does not create a forms section for a single or invalid collection", async () => {
    const { ability, view } = source("", [use("single", "hidden single description")]);
    expect((await enrichAbilityDescriptions(ability, view)).useForms).toEqual([]);
    expect(enrichHTML).not.toHaveBeenCalled();
    expect((await enrichAbilityDescriptions(ability, { ...view, useCollection: { kind: "invalid", isInvalid: true, uses: [], count: 0 } })).useForms).toEqual([]);
  });
});
