import { afterEach, describe, expect, it, vi } from "vitest";

import { localizeAbilityCost } from "./ability-cost-label";

afterEach(() => vi.unstubAllGlobals());

describe("Ability cost label", () => {
  it.each([
    [{ source: "none", amount: 0 }, "Sem custo"],
    [{ source: "health", amount: 2 }, "2 PV"],
    [{ source: "determination", amount: 3 }, "3 PD"],
    [{ source: "resource", amount: 1 }, "1 Recurso"],
  ] as const)("formats %o without exposing its technical source", (cost, expected) => {
    const labels: Record<string, string> = {
      "ORDEMPARANORMAL2.AgentSheet.Abilities.NoCost": "Sem custo",
      "ORDEMPARANORMAL2.AgentSheet.Resources.Health": "PV",
      "ORDEMPARANORMAL2.AgentSheet.Resources.Determination": "PD",
      "ORDEMPARANORMAL2.AgentSheet.Abilities.Resource": "Recurso",
    };
    vi.stubGlobal("game", { i18n: { localize: (key: string) => labels[key] ?? key } });

    expect(localizeAbilityCost(cost)).toBe(expected);
  });
});
