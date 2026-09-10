import { describe, expect, it } from "vitest";

import { buildOpposedCheckParticipantCatalog } from "./opposed-check-participant-catalog";

function actor(
  id: string,
  name: string,
  overrides: Partial<Record<string, unknown>> = {},
) {
  return {
    uuid: `Actor.${id}`,
    type: "agent",
    name,
    img: `actors/${id}.webp`,
    ...overrides,
  } as unknown as foundry.documents.Actor;
}

function token(options: {
  id: string;
  actorLink: boolean;
  actor: foundry.documents.Actor | null;
  name?: string;
  baseActor?: foundry.documents.Actor;
}) {
  return {
    uuid: `Scene.scene.Token.${options.id}`,
    name: options.name ?? options.actor?.name ?? options.id,
    actorLink: options.actorLink,
    actor: options.actor,
    baseActor: options.baseActor,
  };
}

describe("Opposed Check participant catalog", () => {
  it("lists Scene participants first and then remaining World Agents", () => {
    const victor = actor("victor", "Victor");
    const alan = actor("alan", "Alan");

    const catalog = buildOpposedCheckParticipantCatalog({
      sceneTokens: [token({ id: "victor", actorLink: true, actor: victor })],
      worldActors: [alan, victor],
    });

    expect(catalog.map(({ label, group }) => ({ label, group }))).toEqual([
      { label: "Victor", group: "scene" },
      { label: "Alan", group: "world" },
    ]);
  });

  it("uses actorLink true as a World Actor reference and deduplicates linked Tokens", () => {
    const victor = actor("victor", "Victor");
    const catalog = buildOpposedCheckParticipantCatalog({
      sceneTokens: [
        token({ id: "victor1", actorLink: true, actor: victor }),
        token({ id: "victor2", actorLink: true, actor: victor }),
      ],
      worldActors: [victor],
    });

    expect(catalog).toHaveLength(1);
    expect(catalog[0]).toMatchObject({
      reference: { kind: "actor", uuid: "Actor.victor" },
      effectiveActor: victor,
      group: "scene",
    });
  });

  it("uses actorLink false as a Token reference and preserves its Synthetic Actor", () => {
    const baseActor = actor("victor", "Victor Base");
    const syntheticActor = actor("victor", "Victor Ferido", {
      uuid: "Scene.scene.Token.victor1.Actor.victor",
      img: "actors/victor-ferido.webp",
      isToken: true,
    });
    const catalog = buildOpposedCheckParticipantCatalog({
      sceneTokens: [
        token({
          id: "victor1",
          actorLink: false,
          actor: syntheticActor,
          baseActor,
        }),
      ],
      worldActors: [baseActor],
    });

    expect(catalog).toHaveLength(2);
    expect(catalog[0]).toMatchObject({
      reference: { kind: "token", uuid: "Scene.scene.Token.victor1" },
      effectiveActor: syntheticActor,
      img: "actors/victor-ferido.webp",
      group: "scene",
    });
    expect(catalog[1]).toMatchObject({
      reference: { kind: "actor", uuid: "Actor.victor" },
      effectiveActor: baseActor,
      group: "world",
    });
  });

  it("keeps two unlinked Tokens from the same base Actor distinct", () => {
    const baseActor = actor("victor", "Victor");
    const firstSynthetic = actor("victor", "Victor", {
      uuid: "Scene.scene.Token.copy0001.Actor.victor",
    });
    const secondSynthetic = actor("victor", "Victor", {
      uuid: "Scene.scene.Token.copy0002.Actor.victor",
    });
    const catalog = buildOpposedCheckParticipantCatalog({
      sceneTokens: [
        token({
          id: "copy0001",
          actorLink: false,
          actor: firstSynthetic,
          baseActor,
        }),
        token({
          id: "copy0002",
          actorLink: false,
          actor: secondSynthetic,
          baseActor,
        }),
      ],
      worldActors: [baseActor],
    });

    expect(catalog.map(({ reference }) => reference)).toEqual([
      { kind: "token", uuid: "Scene.scene.Token.copy0001" },
      { kind: "token", uuid: "Scene.scene.Token.copy0002" },
      { kind: "actor", uuid: "Actor.victor" },
    ]);
    expect(catalog[0]?.label).toBe("Victor · 0001");
    expect(catalog[1]?.label).toBe("Victor · 0002");
  });

  it("ignores invalid participants and supports a missing Scene", () => {
    const agent = actor("agent", "Agente");
    const itemActor = actor("item", "Item", { type: "item" });
    const catalog = buildOpposedCheckParticipantCatalog({
      sceneTokens: [
        token({ id: "empty", actorLink: false, actor: null }),
        token({ id: "item", actorLink: false, actor: itemActor }),
      ],
      worldActors: [itemActor, agent],
    });

    expect(catalog).toHaveLength(1);
    expect(catalog[0]?.reference).toEqual({
      kind: "actor",
      uuid: "Actor.agent",
    });
  });
});
