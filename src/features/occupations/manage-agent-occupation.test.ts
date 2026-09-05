import { describe, expect, it, vi } from "vitest";

import {
  AgentOccupationConflictError,
  InvalidOccupationSourceError,
  clearAgentOccupation,
  createOccupationSnapshot,
  getAgentOccupation,
  setAgentOccupation,
} from "./manage-agent-occupation";

function item(
  id: string,
  type = "occupation",
  name = "Pesquisador",
): foundry.documents.Item {
  return {
    id,
    name,
    img: null,
    type,
    actor: null,
    system: {},
  } as unknown as foundry.documents.Item;
}

function actor(initialItems: foundry.documents.Item[], type = "agent") {
  const items = [...initialItems];
  const value = {
    type,
    getEmbeddedCollection: vi.fn(() => items),
    createEmbeddedDocuments: vi.fn(async (_name, sources) => {
      const created = sources.map((source: Record<string, unknown>, index: number) => ({
        ...structuredClone(source),
        id: `created-${index}`,
        actor: value,
      })) as unknown as foundry.documents.Item[];
      items.push(...created);
      return created;
    }),
    updateEmbeddedDocuments: vi.fn(async (_name, updates) => {
      return updates.map((update: Record<string, unknown>) => {
        const current = items.find((entry) => entry.id === update._id);
        if (!current) throw new Error("missing Item");
        Object.assign(current, structuredClone(update));
        return current;
      });
    }),
    deleteEmbeddedDocuments: vi.fn(async (_name, ids: string[]) => {
      for (const id of ids) {
        const index = items.findIndex((entry) => entry.id === id);
        if (index >= 0) items.splice(index, 1);
      }
      return [];
    }),
  } as unknown as foundry.documents.Actor;
  return { value, items };
}

describe("manageAgentOccupation", () => {
  it("copies only portable minimal fields", () => {
    const source = Object.assign(item("source"), {
      folder: "folder",
      flags: { module: true },
      ownership: { default: 3 },
    });
    expect(createOccupationSnapshot(source)).toEqual({
      name: "Pesquisador",
      img: "icons/svg/item-bag.svg",
      type: "occupation",
      system: {},
    });
  });

  it("creates, reuses the owned Item, and replaces in place", async () => {
    const configured = actor([]);
    const created = await setAgentOccupation(configured.value, item("source"));
    await setAgentOccupation(configured.value, created);
    await setAgentOccupation(configured.value, item("other", "occupation", "Piloto"));

    expect(configured.items).toHaveLength(1);
    expect(configured.items[0]).toMatchObject({
      id: created.id,
      name: "Piloto",
      type: "occupation",
      system: {},
    });
    expect(configured.value.createEmbeddedDocuments).toHaveBeenCalledTimes(1);
    expect(configured.value.updateEmbeddedDocuments).toHaveBeenCalledTimes(1);
  });

  it("clears only the Occupation", async () => {
    const occupation = item("occupation");
    const ability = item("ability", "ability");
    const configured = actor([occupation, ability]);

    await clearAgentOccupation(configured.value);

    expect(configured.items).toEqual([ability]);
    expect(configured.value.deleteEmbeddedDocuments).toHaveBeenCalledWith(
      "Item",
      ["occupation"],
    );
  });

  it("rejects wrong sources, wrong Actors, and duplicate Occupations", async () => {
    expect(() => createOccupationSnapshot(item("profile", "profile"))).toThrow(
      InvalidOccupationSourceError,
    );
    await expect(
      setAgentOccupation(actor([], "threat").value, item("source")),
    ).rejects.toThrow(TypeError);
    expect(() =>
      getAgentOccupation(actor([item("a"), item("b")]).value),
    ).toThrow(AgentOccupationConflictError);
  });
});
