import { describe, expect, it } from "vitest";

import { restoreEmptyActorName } from "./agent-sheet-form";

describe("Agent sheet name submission", () => {
  it.each(["", "   "])(
    "restores the current Actor name for an empty value %j",
    (submittedName) => {
      const submitData: Record<string, unknown> = {
        name: submittedName,
        system: { level: 2 },
      };

      expect(restoreEmptyActorName(submitData, "Último nome válido")).toBe(
        true,
      );
      expect(submitData).toEqual({
        name: "Último nome válido",
        system: { level: 2 },
      });
    },
  );

  it("preserves a non-empty submitted name", () => {
    const submitData: Record<string, unknown> = { name: "Novo nome" };

    expect(restoreEmptyActorName(submitData, "Nome anterior")).toBe(false);
    expect(submitData.name).toBe("Novo nome");
  });
});
