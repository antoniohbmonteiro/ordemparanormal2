import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { readAbilityUses } from "../../core/abilities/ability-use";

const commonPath = process.env.FOUNDRY_V14_COMMON_PATH;
afterEach(() => vi.unstubAllGlobals());

describe.skipIf(!commonPath)("installed Foundry v14 shared Ability model", () => {
  it("round trips old forms and combat forms, rejecting an overlapping modifier", async () => {
    const native = await import(/* @vite-ignore */ pathToFileURL(commonPath!).href);
    vi.stubGlobal("foundry", native);
    const { AbilityDataModel } = await import("./ability-data-model");
    const ordinary = {
      id: "ordinary", name: "Uso", description: "", cost: { source: "none", amount: 0 },
      minimumLevel: null, checkIntegration: null,
    };
    const action = {
      ...ordinary, id: "combat", combatAction: {
        typeLabel: "Ataque", requirements: "Alcance curto",
        check: { kind: "aptitude", key: "tactics", attribute: "mind" },
        damage: { expression: "1d6 PV", timing: "perRound" },
      },
    };
    const data = { characteristic: "passiveEffect", uses: [ordinary, action] };
    const model = new AbilityDataModel(structuredClone(data), { strict: true });
    expect(model.toObject()).toMatchObject(data);
    expect(readAbilityUses(model.uses)).toEqual([ordinary, action]);
    const invalid = [ordinary, {
      ...action, checkIntegration: { modification: { type: "extraDie", applicability: { type: "any" }, die: 6 } },
    }];
    expect(readAbilityUses(invalid)).toBeNull();
    expect(() => new AbilityDataModel({ uses: invalid }, { strict: true })).toThrow();
    expect(readAbilityUses(model.uses)).toEqual([ordinary, action]);
  });
});
