import { describe, expect, it, vi } from "vitest";

import type { AbilityUseData } from "../../../core/abilities/ability-use";
import {
  deleteAbilityUse,
  moveAbilityUse,
  saveExistingAbilityUse,
  saveNewAbilityUse,
} from "./update-ability-uses";

const first: AbilityUseData = {
  id: "first", name: "Primeira", description: "A",
  cost: { source: "none", amount: 0 }, minimumLevel: null,
};
const second: AbilityUseData = {
  id: "second", name: "Segunda", description: "B",
  cost: { source: "none", amount: 0 }, minimumLevel: null,
};

function abilityWith(uses: AbilityUseData[]) {
  const ability = {
    system: { uses: structuredClone(uses) },
    update: vi.fn(async (changes: { "system.uses": AbilityUseData[] }) => {
      ability.system.uses = structuredClone(changes["system.uses"]);
    }),
  };
  return ability as unknown as foundry.documents.Item;
}

describe("Ability use persistence", () => {
  it("merges disjoint saves from stale editors against current state", async () => {
    const ability = abilityWith([first]);
    const editDescription = saveExistingAbilityUse(ability, first, {
      ...first, description: "Atualizada",
    });
    const editName = saveExistingAbilityUse(ability, first, {
      ...first, name: "Renomeada",
    });
    await Promise.all([editDescription, editName]);
    expect((ability.system as unknown as { uses: AbilityUseData[] }).uses).toEqual([{
      ...first, name: "Renomeada", description: "Atualizada",
    }]);
    expect(ability.update).toHaveBeenCalledTimes(2);
  });

  it("preserves saves to different forms and applies same-field last-save-wins", async () => {
    const ability = abilityWith([first, second]);
    await Promise.all([
      saveExistingAbilityUse(ability, first, { ...first, name: "Primeira A" }),
      saveExistingAbilityUse(ability, second, { ...second, name: "Segunda B" }),
    ]);
    await Promise.all([
      saveExistingAbilityUse(ability, { ...first, name: "Primeira A" }, { ...first, name: "Nome 1" }),
      saveExistingAbilityUse(ability, { ...first, name: "Primeira A" }, { ...first, name: "Nome 2" }),
    ]);
    expect((ability.system as unknown as { uses: AbilityUseData[] }).uses.map(({ name }) => name))
      .toEqual(["Nome 2", "Segunda B"]);
  });

  it("resolves the latest position before reordering", async () => {
    const third = { ...second, id: "third", name: "Terceira" };
    const ability = abilityWith([first, second, third]);
    await Promise.all([
      deleteAbilityUse(ability, "first"),
      moveAbilityUse(ability, "third", "up"),
    ]);
    expect((ability.system as unknown as { uses: AbilityUseData[] }).uses.map(({ id }) => id))
      .toEqual(["third", "second"]);
  });

  it("serializes add, move and delete without replacing unrelated entries", async () => {
    const ability = abilityWith([first]);
    await saveNewAbilityUse(ability, second);
    await moveAbilityUse(ability, "second", "up");
    await deleteAbilityUse(ability, "first");
    expect((ability.system as unknown as { uses: AbilityUseData[] }).uses).toEqual([second]);
  });

  it("does not recreate a use removed before a stale save", async () => {
    const ability = abilityWith([first]);
    await deleteAbilityUse(ability, "first");
    await expect(saveExistingAbilityUse(ability, first, { ...first, name: "Nova" }))
      .resolves.toEqual({ status: "stale" });
    expect((ability.system as unknown as { uses: AbilityUseData[] }).uses).toEqual([]);
  });

  it("revalidates the owned resource when a queued save reaches the document", async () => {
    const ability = abilityWith([]);
    await expect(saveNewAbilityUse(ability, {
      ...first,
      cost: { source: "resource", amount: 1 },
    })).resolves.toEqual({ status: "invalid-use" });
    expect(ability.update).not.toHaveBeenCalled();
  });
});
