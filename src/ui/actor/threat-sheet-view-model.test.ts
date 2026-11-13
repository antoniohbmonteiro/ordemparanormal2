import { readFile } from "node:fs/promises";
import Handlebars from "handlebars";
import { describe, expect, it, vi } from "vitest";
import translations from "../../../lang/pt-BR.json";
import type { ThreatAction } from "../../documents/actor/threat-data-model";
import { collectOwnedAbilities } from "../../adapters/foundry/abilities/owned-abilities";
import { FREE_ABILITY_COST } from "../../core/abilities/ability-cost";

function localize(key: string): string {
  const value = key.split(".").reduce<unknown>(
    (node, part) => node && typeof node === "object" ? Reflect.get(node, part) : undefined,
    translations,
  );
  return typeof value === "string" ? value : key;
}

describe("Threat action damage summaries", () => {
  it("renders labels from timing and escapes the expression", async () => {
    vi.stubGlobal("foundry", { abstract: { TypeDataModel: class {} } });
    try {
      const { buildThreatSheetViewModel } = await import("./threat-sheet-view-model");
      const base = { check: null, description: "", requirements: "", typeLabel: "" };
      const actions: ThreatAction[] = [
        { ...base, id: "claws", name: "Garras", damage: { timing: "immediate", expression: "RA+1" } },
        { ...base, id: "hold", name: "Afogar", damage: { timing: "perRound", expression: "1d6 PV" } },
        { ...base, id: "explicit", name: "Explícita", damage: { timing: "immediate", expression: "<dano por rodada>" } },
        { ...base, id: "other", name: "Outra", damage: null },
      ];
      const system = {
        category: "", elements: [], damageReduction: 0, actions, skills: [], conditions: [],
        attributes: { physical: 8, mind: 4, emotion: 4 } as const, resources: { health: { value: 4, max: 10 } },
        characteristics: { passiveEffects: [], specialAbilities: [], vulnerabilities: "", immunities: "", fearEnigma: "" },
      };
      const threat = buildThreatSheetViewModel(system, localize, "test", new Set(["legacy-actions-hold"]));
      expect(threat.hasDamageReduction).toBe(true);
      expect(threat.abilities.map((card) => "combatSummary" in card ? card.combatSummary?.damageSummary : undefined)).toEqual([
        { label: "Dano", expression: "RA+1" },
        { label: "Por rodada", expression: "1d6 PV" },
        { label: "Dano", expression: "<dano por rodada>" },
        null,
      ]);
      const handlebars = Handlebars.create();
      handlebars.registerHelper("localize", localize);
      const template = await readFile(new URL("../../../templates/actor/partials/ability-cards.hbs", import.meta.url), "utf8");
      const html = handlebars.compile(template)({ abilities: threat.abilities });
      expect(html).toContain("<span>Dano <strong>RA+1</strong></span>");
      expect(html).toContain("<span>Por rodada <strong>1d6 PV</strong></span>");
      expect(html).toContain("&lt;dano por rodada&gt;");
      expect(html).toContain('aria-expanded="true" aria-controls="test-ability-details-legacy-actions-hold"');

      const form = { id: "use", name: "Uso", description: "", minimumLevel: null, cost: FREE_ABILITY_COST, checkIntegration: null };
      const modifier = {
        ...form, id: "modifier", name: "Modificar",
        checkIntegration: { modification: { type: "extraDie", applicability: { type: "any" }, die: 4 } },
      };
      const combat = {
        ...form, id: "combat", name: "Ataque",
        combatAction: { ...base, check: { kind: "attribute", key: "physical", attribute: null }, damage: actions[0]!.damage },
      };
      const items = [
        { id: "passive", uses: [] }, { id: "common", uses: [form] },
        { id: "modifier", uses: [modifier] }, { id: "mixed", uses: [form, modifier, combat] },
      ].map(({ id, uses }, sort) => ({
        id, type: "ability", name: id, sort, system: { uses, resource: id === "mixed" ? { value: 1, max: 2 } : null },
      })) as unknown as foundry.documents.Item[];
      const unified = buildThreatSheetViewModel({ ...system, actions: [actions[0]!] }, localize, "test",
        new Set(["modifier", "mixed"]), collectOwnedAbilities(items), new Set(["actions:claws"]), true);
      expect(unified.abilities.map(({ id }) => id)).toEqual(["passive", "common", "modifier", "mixed"]);
      handlebars.registerPartial("systems/ordemparanormal2/templates/actor/partials/threat-ability-use.hbs",
        await readFile(new URL("../../../templates/actor/partials/threat-ability-use.hbs", import.meta.url), "utf8"));
      const unifiedHTML = handlebars.compile(template)({ editable: true, canRoll: true, abilities: unified.abilities });
      expect(unifiedHTML).toContain('data-action="useAbilityForm" data-item-id="common" data-use-id="use"');
      expect(unifiedHTML).toContain('data-action="useAbilityForm" data-item-id="mixed" data-use-id="combat"');
      expect(unifiedHTML).not.toMatch(/data-action="useAbilityForm" data-item-id="(?:passive|modifier)"/);
      expect(unifiedHTML).toContain("Modifica um teste em andamento");
      expect(unifiedHTML).toContain("Teste <strong>d8</strong>");
      expect(unifiedHTML).toContain('aria-valuetext="1 / 2"');
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
