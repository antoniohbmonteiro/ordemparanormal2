import { afterEach, describe, expect, it, vi } from "vitest";
import { SKILL_DEFINITIONS } from "../config/skills";
import { managedDigest } from "../core/adventure-import/adventure-agent-reconciliation";
import {
  PoiMigrationPreflightError, migratePoiInformation, preflightPoiInformationMigration,
} from "./migrate-poi-information";

class Replacement {
  static create(value: unknown) { return new Replacement(value); }
  constructor(readonly value: unknown) {}
}
interface Data { system: Record<string, unknown>; flags: Record<string, Record<string, unknown>> }
class FakeItem {
  readonly type = "pointOfInterest";
  readonly update = vi.fn(async (changes: Record<string, unknown>) => {
    for (const [path, wrapped] of Object.entries(changes)) {
      const value = wrapped instanceof Replacement ? wrapped.value : wrapped;
      if (path === "system") { this.data.system = structuredClone(value as Record<string, unknown>); continue; }
      const parts = path.split(".");
      if (parts[0] !== "flags") throw new Error(`Unexpected path: ${path}`);
      this.data.flags[parts[1]] ??= {};
      this.data.flags[parts[1]][parts[2]] = structuredClone(value);
    }
  });
  constructor(readonly uuid: string, readonly data: Data) {}
  toObject() {
    const source = structuredClone(this.data);
    if (!Object.hasOwn(source.system, "skills")) source.system.skills = undefined;
    return source;
  }
  getFlag(scope: string, key: string) { return this.data.flags[scope]?.[key]; }
}
const legacyEntry = (id: string) => ({ id, difficulty: 6, content: id, showDifficultyToPlayers: false });
const legacy = (groups: unknown) => ({ publicDescription: "Público", gmContext: "GM", skills: groups, information: [] });
const group = (skill: string, id: string) => ({ skill, information: [legacyEntry(id)] });
const item = (uuid: string, system: Record<string, unknown>, flags: Data["flags"] = {}) =>
  new FakeItem(uuid, { system, flags });
const asItems = (items: FakeItem[]) => items as unknown as foundry.documents.Item[];
const emptyActors: foundry.documents.Actor[] = [];
const emptyScenes: foundry.documents.Scene[] = [];

afterEach(() => vi.unstubAllGlobals());
function stubFoundry() {
  vi.stubGlobal("foundry", { data: { operators: { ForcedReplacement: Replacement } } });
}

describe("POI information migration", () => {
  it("collects every unsafe legacy POI before any write", async () => {
    stubFoundry();
    const valid = item("Item.valid", legacy([group("research", "a")]));
    const aptitude = item("Item.aptitude", legacy([group("aptitude", "b")]));
    const malformed = item("Item.malformed", legacy([{ skill: "research", information: [] }]));
    const duplicateIds = item("Item.duplicateIds", legacy([
      group("research", "c"), group("technology", "c"),
    ]));
    const items = asItems([valid, aptitude, malformed, duplicateIds]);
    await expect(migratePoiInformation(items, emptyActors, emptyScenes)).rejects.toMatchObject({
      issues: [
        { uuid: "Item.malformed", reason: expect.any(String) },
        { uuid: "Item.duplicateIds", reason: expect.stringContaining("ID duplicado") },
      ],
    });
    expect(valid.update).not.toHaveBeenCalled();
    expect(aptitude.update).not.toHaveBeenCalled();
    expect(malformed.update).not.toHaveBeenCalled();
    expect(duplicateIds.update).not.toHaveBeenCalled();
    expect(aptitude.toObject().system.skills).toEqual([group("aptitude", "b")]);
  });

  it("migrates legacy Aptitude with the first canonical registry specialization", async () => {
    stubFoundry();
    const aptitude = SKILL_DEFINITIONS.find(definition => definition.key === "aptitude");
    const firstSpecialization = aptitude && "specializations" in aptitude
      ? aptitude.specializations[0]?.key : undefined;
    expect(firstSpecialization).toBeDefined();
    const legacyAptitude = item("Item.aptitude", legacy([group("aptitude", "clue")]));
    const plans = await preflightPoiInformationMigration(asItems([legacyAptitude]), emptyActors, emptyScenes);
    expect(plans).toHaveLength(1);
    expect(legacyAptitude.update).not.toHaveBeenCalled();
    await migratePoiInformation(asItems([legacyAptitude]), emptyActors, emptyScenes);
    expect(legacyAptitude.data.system).not.toHaveProperty("skills");
    expect(legacyAptitude.data.system.information).toEqual([{
      id: "clue", content: "clue", approaches: [{
        skill: "aptitude", specialization: firstSpecialization,
        difficulty: 6, showDifficultyToPlayers: false,
      }],
    }]);
    await migratePoiInformation(asItems([legacyAptitude]), emptyActors, emptyScenes);
    expect(legacyAptitude.update).toHaveBeenCalledTimes(1);
  });

  it("compares the explicit legacy authored shape to the old baseline and remaps knowledge", async () => {
    stubFoundry();
    const skills = [
      { skill: "research", information: [{ ...legacyEntry("emailBoxResearch"), content: "email" }] },
      { skill: "technology", information: [{ ...legacyEntry("emailBoxTechnology"), content: "email" }] },
    ];
    const oldAuthored = { publicDescription: "Público", gmContext: "GM", skills };
    const flag = { importer: "pointOfInterest", adventureId: "playtest-alpha",
      documentId: "actOne.map.22", state: "complete", presetRevision: 1,
      baseline: await managedDigest(oldAuthored) };
    const imported = item("Item.imported", { ...oldAuthored, information: [] }, {
      ordemparanormal2: { adventureImport: flag, pointOfInterestKnowledge: {
        agents: [
          { actorUuid: "Actor.a", informationIds: ["emailBoxTechnology", "other"] },
          { actorUuid: "Actor.b", informationIds: ["emailBoxResearch", "emailBoxTechnology"] },
        ],
      } },
    });
    const plans = await preflightPoiInformationMigration(asItems([imported]), emptyActors, emptyScenes);
    expect(plans).toHaveLength(1);
    expect(imported.update).not.toHaveBeenCalled();
    await migratePoiInformation(asItems([imported]), emptyActors, emptyScenes);
    expect(imported.data.system).not.toHaveProperty("skills");
    expect(imported.data.system.information).toEqual([{ id: "emailBoxResearch", content: "email", approaches: [
      { skill: "research", difficulty: 6, showDifficultyToPlayers: false },
      { skill: "technology", difficulty: 6, showDifficultyToPlayers: false },
    ] }]);
    expect(imported.getFlag("ordemparanormal2", "pointOfInterestKnowledge")).toEqual({ agents: [
      { actorUuid: "Actor.a", informationIds: ["emailBoxResearch", "other"] },
      { actorUuid: "Actor.b", informationIds: ["emailBoxResearch"] },
    ] });
    expect((imported.getFlag("ordemparanormal2", "adventureImport") as typeof flag).baseline)
      .toBe(await managedDigest(imported.data.system));
    await migratePoiInformation(asItems([imported]), emptyActors, emptyScenes);
    expect(imported.update).toHaveBeenCalledTimes(1);
  });

  it("keeps divergent imported discoveries separate and rejects old/new conflicts", async () => {
    stubFoundry();
    const skills = [group("research", "emailBoxResearch"), group("technology", "emailBoxTechnology")];
    const changed = item("Item.changed", legacy(skills), { ordemparanormal2: {
      adventureImport: { importer: "pointOfInterest", adventureId: "playtest-alpha",
        documentId: "actOne.map.22", state: "complete", baseline: "different" },
    } });
    await migratePoiInformation(asItems([changed]), emptyActors, emptyScenes);
    expect((changed.data.system.information as unknown[])).toHaveLength(2);
    expect((changed.getFlag("ordemparanormal2", "adventureImport") as { baseline: string }).baseline).toBe("different");
    const conflict = item("Item.conflict", { ...legacy([group("research", "a")]), information: [
      { id: "different", content: "x", approaches: [{ skill: "research", difficulty: 6, showDifficultyToPlayers: false }] },
    ] });
    await expect(preflightPoiInformationMigration(asItems([conflict]), emptyActors, emptyScenes))
      .rejects.toBeInstanceOf(PoiMigrationPreflightError);
    expect(conflict.update).not.toHaveBeenCalled();
  });

  it("retries idempotently after an I/O failure during Apply", async () => {
    stubFoundry();
    const first = item("Item.first", legacy([group("research", "a")]));
    const second = item("Item.second", legacy([group("technology", "b")]));
    second.update.mockRejectedValueOnce(new Error("I/O failed"));
    const items = asItems([first, second]);
    await expect(migratePoiInformation(items, emptyActors, emptyScenes)).rejects.toThrow("I/O failed");
    expect(first.data.system).not.toHaveProperty("skills");
    expect(second.data.system).toHaveProperty("skills");
    await migratePoiInformation(items, emptyActors, emptyScenes);
    expect(first.update).toHaveBeenCalledTimes(1);
    expect(second.update).toHaveBeenCalledTimes(2);
    expect(second.data.system).not.toHaveProperty("skills");
  });

  it("enumerates Actor Items and only delta-owned Items in unlinked tokens", async () => {
    stubFoundry();
    const embedded = item("Actor.a.Item.poi", legacy([group("research", "actor")]));
    const deltaOwned = item("Scene.s.Token.t.ActorDelta.Item.poi", legacy([group("research", "delta")]));
    const inherited = item("Scene.s.Token.t.Actor.Item.inherited", legacy([group("research", "inherited")]));
    const actor = { getEmbeddedCollection: () => [embedded] };
    const scenes = [{ tokens: [{ actorLink: false, delta: {
      toObject: () => ({ items: [{ _id: "poi" }] }),
      getEmbeddedDocument: (_name: string, id: string) => id === "poi" ? deltaOwned : inherited,
    } }, { actorLink: true, delta: {
      toObject: () => { throw new Error("linked delta enumerated"); },
    } }] }];
    await migratePoiInformation(asItems([]), [actor] as unknown as foundry.documents.Actor[],
      scenes as unknown as foundry.documents.Scene[]);
    expect(embedded.data.system).not.toHaveProperty("skills");
    expect(deltaOwned.data.system).not.toHaveProperty("skills");
    expect(inherited.update).not.toHaveBeenCalled();
  });
});
