import { describe, expect, it } from "vitest";

import {
  areOpposedCheckParticipantReferencesEqual,
  encodeOpposedCheckParticipantReference,
  parseOpposedCheckParticipantReference,
  type OpposedCheckDialogResult,
} from "./opposed-check-configuration";

describe("Opposed Check participant references", () => {
  it.each([
    { kind: "actor", uuid: "Actor.victor" },
    { kind: "token", uuid: "Scene.investigation.Token.victor1" },
  ] as const)("round-trips a canonical $kind reference", (reference) => {
    expect(
      parseOpposedCheckParticipantReference(
        encodeOpposedCheckParticipantReference(reference),
      ),
    ).toEqual(reference);
  });

  it("compares both reference kind and UUID", () => {
    const actor = { kind: "actor", uuid: "Actor.victor" } as const;
    const token = {
      kind: "token",
      uuid: "Scene.investigation.Token.victor",
    } as const;

    expect(areOpposedCheckParticipantReferencesEqual(actor, actor)).toBe(true);
    expect(areOpposedCheckParticipantReferencesEqual(token, token)).toBe(true);
    expect(areOpposedCheckParticipantReferencesEqual(actor, token)).toBe(false);
    expect(
      areOpposedCheckParticipantReferencesEqual(token, {
        kind: "token",
        uuid: "Scene.investigation.Token.victor2",
      }),
    ).toBe(false);
  });

  it("keeps the complete dialog result serializable", () => {
    const result: OpposedCheckDialogResult = {
      left: {
        participant: { kind: "actor", uuid: "Actor.victor" },
        selection: { kind: "skill", key: "fighting" },
      },
      right: {
        participant: {
          kind: "token",
          uuid: "Scene.investigation.Token.edgar",
        },
        selection: { kind: "aptitude", key: "tactics" },
      },
    };

    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });

  it.each([
    "actor|Scene.scene.Token.token",
    "token|Actor.actor",
    "actor|Actor.a.extra",
    "token|Scene.scene.Token.token.extra",
    "invalid",
  ])("rejects invalid encoded reference %s", (value) => {
    expect(() => parseOpposedCheckParticipantReference(value)).toThrow();
  });
});
