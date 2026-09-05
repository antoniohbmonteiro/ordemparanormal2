import { describe, expect, it, vi } from "vitest";

import { migratePersistedAgentOccupation } from "./migrate-agent-occupation";

function actor(options: {
  occupation: string;
  items?: Record<string, unknown>[];
  flag?: unknown;
}) {
  const items = [...(options.items ?? [])];
  const system = { occupation: options.occupation };
  const value = {
    id: "agent-1",
    type: "agent",
    system,
    getEmbeddedCollection: vi.fn(() => items),
    getFlag: vi.fn(() => options.flag),
    setFlag: vi.fn(async () => undefined),
    createEmbeddedDocuments: vi.fn(async (_name, sources) => {
      const created = sources.map((source: Record<string, unknown>) => ({
        ...source,
        id: "occupation-1",
      }));
      items.push(...created);
      return created;
    }),
    update: vi.fn(async (update: Record<string, unknown>) => {
      if (update["system.occupation"] === "") system.occupation = "";
      return value;
    }),
  } as unknown as foundry.documents.Actor;
  return { value, items };
}

describe("migratePersistedAgentOccupation", () => {
  it("ignores empty legacy values", async () => {
    const configured = actor({ occupation: "" });
    await migratePersistedAgentOccupation(configured.value);
    expect(configured.value.createEmbeddedDocuments).not.toHaveBeenCalled();
    expect(configured.value.update).not.toHaveBeenCalled();
  });

  it("creates before clearing and remains idempotent", async () => {
    const configured = actor({ occupation: "  Pesquisador  " });
    await migratePersistedAgentOccupation(configured.value);
    await migratePersistedAgentOccupation(configured.value);

    expect(configured.items).toEqual([
      expect.objectContaining({
        name: "  Pesquisador  ",
        type: "occupation",
        system: {},
      }),
    ]);
    expect(configured.value.createEmbeddedDocuments).toHaveBeenCalledTimes(1);
    expect(configured.value.update).toHaveBeenCalledTimes(1);
    expect(vi.mocked(configured.value.createEmbeddedDocuments).mock.invocationCallOrder[0])
      .toBeLessThan(vi.mocked(configured.value.update).mock.invocationCallOrder[0]);
  });

  it("does not clear after a creation failure", async () => {
    const configured = actor({ occupation: "Pesquisador" });
    vi.mocked(configured.value.createEmbeddedDocuments).mockRejectedValueOnce(
      new Error("database unavailable"),
    );
    await expect(migratePersistedAgentOccupation(configured.value)).rejects.toThrow(
      "database unavailable",
    );
    expect(configured.value.system as unknown).toEqual({
      occupation: "Pesquisador",
    });
    expect(configured.value.update).not.toHaveBeenCalled();
  });

  it("archives before clearing when an Occupation already exists", async () => {
    const configured = actor({
      occupation: "Pesquisador",
      items: [{ id: "occupation", type: "occupation" }],
    });
    await migratePersistedAgentOccupation(configured.value);
    expect(configured.value.setFlag).toHaveBeenCalledWith(
      "ordemparanormal2",
      "legacyOccupation",
      { value: "Pesquisador", migrationVersion: 1 },
    );
    expect(vi.mocked(configured.value.setFlag).mock.invocationCallOrder[0])
      .toBeLessThan(vi.mocked(configured.value.update).mock.invocationCallOrder[0]);
    expect(configured.value.createEmbeddedDocuments).not.toHaveBeenCalled();
  });

  it("rejects a divergent archived value without clearing", async () => {
    const configured = actor({
      occupation: "Pesquisador",
      items: [{ id: "occupation", type: "occupation" }],
      flag: { value: "Piloto", migrationVersion: 1 },
    });
    await expect(migratePersistedAgentOccupation(configured.value)).rejects.toThrow(
      "conflicting",
    );
    expect(configured.value.setFlag).not.toHaveBeenCalled();
    expect(configured.value.update).not.toHaveBeenCalled();
  });
});
