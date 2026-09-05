import { describe, expect, it } from "vitest";

import { preparePendingAgentOccupation } from "./prepare-pending-agent-occupation";

describe("preparePendingAgentOccupation", () => {
  it("does nothing without non-empty legacy text", () => {
    expect(preparePendingAgentOccupation({ system: { occupation: "" } })).toEqual({
      status: "unchanged",
    });
  });

  it("adds one minimal pending Occupation and preserves the exact name", () => {
    const ability = { type: "ability", name: "Manual" };
    expect(
      preparePendingAgentOccupation({
        system: { occupation: "  Texto exato  " },
        items: [ability],
      }),
    ).toEqual({
      status: "update",
      update: {
        "system.occupation": "",
        items: [
          ability,
          {
            name: "  Texto exato  ",
            img: "icons/svg/item-bag.svg",
            type: "occupation",
            system: {},
          },
        ],
      },
    });
  });

  it("archives legacy text when an Occupation is already pending", () => {
    const result = preparePendingAgentOccupation({
      system: { occupation: "Pesquisador" },
      items: [{ type: "occupation", name: "Piloto" }],
      flags: { ordemparanormal2: { unrelated: true } } as never,
    });
    expect(result).toEqual({
      status: "update",
      update: {
        "system.occupation": "",
        "flags.ordemparanormal2.legacyOccupation": {
          value: "Pesquisador",
          migrationVersion: 1,
        },
      },
    });
  });

  it("keeps an equal flag but reports a divergent flag as a conflict", () => {
    const base = {
      system: { occupation: "Pesquisador" },
      items: [{ type: "occupation" }],
    };
    expect(
      preparePendingAgentOccupation({
        ...base,
        flags: {
          ordemparanormal2: {
            legacyOccupation: { value: "Pesquisador", migrationVersion: 1 },
          },
        },
      }),
    ).toEqual({
      status: "update",
      update: { "system.occupation": "" },
    });
    expect(
      preparePendingAgentOccupation({
        ...base,
        flags: {
          ordemparanormal2: {
            legacyOccupation: { value: "Piloto", migrationVersion: 1 },
          },
        },
      }),
    ).toEqual({
      status: "conflict",
      occupation: "Pesquisador",
      legacyFlag: "Piloto",
    });
  });
});
