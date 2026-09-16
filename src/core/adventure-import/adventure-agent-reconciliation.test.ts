import { describe, expect, it } from "vitest";
import { actorProjection, itemProjection, managedDigest, preserveAbilityResourceValue, relevantAgentState, type AgentActorSource } from "./adventure-agent-reconciliation";

const actor = (): AgentActorSource => ({ _id: "actor", name: "Original", type: "agent", img: "portrait.png",
  prototypeToken: { name: "Token", texture: { src: "token.png", scaleX: 1 }, sight: { enabled: true } },
  system: { level: 2, appearance: { accentColor: "#123456" }, attributes: { physical: 6 }, skills: { aptitude: { arts: 4 } }, resources: { health: { value: 1, max: 10 }, determination: { value: 3, max: 12 } } },
  items: [{ _id: "ability", type: "ability", name: "Canonical", img: "ability.png", system: { resource: { value: 1, max: 5 }, uses: [] }, flags: { ordemparanormal2: { sourceUuid: "Compendium.ordemparanormal2.abilities.Item.ability000000018" } } }],
});
describe("Adventure managed source projections", () => {
  it("hashes deterministically independently of property order", async () => {
    expect(await managedDigest({ a: 1, b: { c: 2, d: 3 } })).toBe(await managedDigest({ b: { d: 3, c: 2 }, a: 1 }));
    expect(await managedDigest({ a: 2 })).not.toBe(await managedDigest({ a: 1 }));
  });
  it("excludes names, token settings, accent and current resources from managed Actor comparison", async () => {
    const before = actor(), after = structuredClone(before) as unknown as Record<string, unknown>;
    after.name = "Renamed"; after.folder = "custom"; after.sort = 9; after.ownership = { default: 3 }; after.effects = [{ name: "effect" }];
    const system = after.system as Record<string, unknown>; system.appearance = { accentColor: "#ABCDEF" }; system.resources = { health: { value: 99, max: 10 }, determination: { value: 88, max: 12 } };
    after.prototypeToken = { name: "Renamed", sight: { enabled: false }, texture: { src: "token.png", scaleX: 2 } };
    expect(await managedDigest(actorProjection(before))).toBe(await managedDigest(actorProjection(after as unknown as AgentActorSource)));
  });
  it("preserves existing resource values without clamp, and restores canonical container shape", () => {
    expect(preserveAbilityResourceValue({ resource: { value: 0, max: 5 }, uses: [] }, { resource: { value: 999, max: 99 } })).toEqual({ resource: { value: 999, max: 5 }, uses: [] });
    expect(preserveAbilityResourceValue({ resource: null }, { resource: { value: 9, max: 5 } })).toEqual({ resource: null });
    expect(preserveAbilityResourceValue({ resource: { value: 0, max: 5 } }, { resource: null })).toEqual({ resource: { value: 0, max: 5 } });
  });
  it("does not compare manual Ability payloads but detects changes in satisfaction identity", () => {
    const before = actor(), after = structuredClone(before);
    after.items[0].system.custom = true;
    expect(relevantAgentState(after)).toBe(relevantAgentState(before));
    after.items[0].flags!.ordemparanormal2 = { sourceUuid: "Item.other" };
    expect(relevantAgentState(after)).not.toBe(relevantAgentState(before));
  });
  it("ignores only the current Ability resource value in portable managed data", async () => {
    const before = actor().items[0], after = structuredClone(before);
    after.system.resource = { value: 999, max: 5 };
    expect(await managedDigest(itemProjection(after))).toBe(await managedDigest(itemProjection(before)));
    after.system.resource = { value: 999, max: 6 };
    expect(await managedDigest(itemProjection(after))).not.toBe(await managedDigest(itemProjection(before)));
  });
});
