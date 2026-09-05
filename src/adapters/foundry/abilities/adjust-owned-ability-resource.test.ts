import { describe, expect, it, vi } from "vitest";

import { adjustOwnedAbilityResource } from "./adjust-owned-ability-resource";

function createActor(resource: unknown, type = "ability") {
  const update = vi.fn().mockResolvedValue(undefined);
  const ability = { type, system: { resource }, update };
  const actor = {
    getEmbeddedDocument: vi.fn().mockReturnValue(ability),
  } as unknown as foundry.documents.Actor;

  return { actor, update };
}

describe("adjust owned Ability resource", () => {
  it("updates only the embedded Ability resource value", async () => {
    const { actor, update } = createActor({ value: 2, max: 3 });

    await expect(adjustOwnedAbilityResource(actor, "ability-1", -1)).resolves
      .toEqual({ status: "updated", value: 1 });
    expect(update).toHaveBeenCalledOnce();
    expect(update).toHaveBeenCalledWith({ "system.resource.value": 1 });
  });

  it("does not update when the requested boundary is already reached", async () => {
    const { actor, update } = createActor({ value: 3, max: 3 });

    await expect(adjustOwnedAbilityResource(actor, "ability-1", 1)).resolves
      .toEqual({ status: "unchanged", value: 3 });
    expect(update).not.toHaveBeenCalled();
  });

  it.each([
    [null, "ability"],
    [{ value: 1, max: 3 }, "profile"],
  ])("rejects an invalid target (%j, %s)", async (resource, type) => {
    const { actor, update } = createActor(resource, type);

    await expect(adjustOwnedAbilityResource(actor, "ability-1", 1)).resolves
      .toEqual({ status: "invalid" });
    expect(update).not.toHaveBeenCalled();
  });
});
