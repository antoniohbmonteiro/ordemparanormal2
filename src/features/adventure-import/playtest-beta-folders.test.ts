import { afterEach, describe, expect, it, vi } from "vitest";
import { BETA_AGENTS, BETA_ID, BETA_POIS, BETA_THREATS, type BetaMissionId } from "../../config/adventure-definitions/playtest-beta";
import { EMPTY_CUSTOM_SKILL_CATALOG } from "../../core/actors/custom-skills";
import { POI_SCENE_ITEMS_FLAG } from "../../adapters/foundry/points-of-interest/poi-runtime-state";
import type { BetaDocument, BetaTarget } from "../../adapters/foundry/playtest-beta-documents";
import { ADVENTURE_FOLDER_PLACEMENT_FLAG_PATH, type AdventureFolderPort, type AdventureFolderSnapshot } from "./adventure-folders";
import { createBetaDocumentPlan } from "./playtest-beta-content";
import { betaAgentFolder, betaPoiFolder, prepareBetaFolders, reconcileBetaFolderPlacement } from "./playtest-beta-folders";
import { planBetaSkills } from "./playtest-beta-skills";
import type { PreparedBetaMission } from "./prepare-playtest-beta";

class WorldFolders implements AdventureFolderPort {
  readonly records: AdventureFolderSnapshot[] = [];
  isAuthorized() { return true; }
  listFolders() { return this.records; }
  async createFolder(input: Parameters<AdventureFolderPort["createFolder"]>[0]) {
    const id = "folder" + this.records.length;
    this.records.push({ id, name: input.name, color: input.color, type: input.documentType, parentId: input.parentId, flag: input.flag });
    return id;
  }
  async updateFolder(id: string, input: Parameters<AdventureFolderPort["updateFolder"]>[1]) {
    const position = this.records.findIndex(folder => folder.id === id);
    this.records[position] = { ...this.records[position], ...input };
  }
  path(id: string | null): string {
    const folder = this.records.find(record => record.id === id);
    return folder ? [this.path(folder.parentId), folder.name].filter(Boolean).join("/") : "";
  }
}

const attributes = { physical: 8, mind: 6, emotion: 4 } as const;
function prepare(mission: BetaMissionId): PreparedBetaMission {
  return { mission, file: new File([], "extras.zip"), narrative: [],
    agents: BETA_AGENTS.filter(agent => mission === "mission2" || agent.page <= 12).map(agent => ({
      ...agent, attributes, level: 3, profile: "Analista", vocation: "Ocupação", health: 12, determination: 8,
      abilities: [], skills: [], equipment: "",
    })),
    threats: BETA_THREATS.filter(threat => threat.mission === mission).map(threat => ({
      ...threat, health: 10, attributes, notes: "", skills: [], actions: [],
    })),
    pois: BETA_POIS[mission].map(poi => ({ ...poi, rows: [], context: "" })),
  };
}

function fakeDocument(target: BetaTarget, index: number) {
  const state = structuredClone(target.source);
  const id = String(index).padStart(16, "0");
  const flag = state.flags as Record<string, Record<string, unknown>> | undefined;
  let placement = flag?.ordemparanormal2?.adventureImportFolder;
  let poiUuids: unknown;
  const document: BetaDocument & { getEmbeddedCollection(): { contents: BetaDocument[] } } = {
    getEmbeddedCollection: () => ({ contents: [] }),
    id, uuid: target.type + "." + id, name: target.name,
    getFlag: (_scope, key) => key === "adventureImportFolder" ? placement : key === "adventureImport"
      ? { adventureId: BETA_ID, importer: target.type, documentId: target.id, desired: "", baseline: "", fields: [], version: 1 } : poiUuids,
    toObject: () => structuredClone(state),
    update: vi.fn(async (patch: Record<string, unknown>) => {
      if (Object.hasOwn(patch, "folder")) state.folder = patch.folder;
      if (Object.hasOwn(patch, ADVENTURE_FOLDER_PLACEMENT_FLAG_PATH)) placement = patch[ADVENTURE_FOLDER_PLACEMENT_FLAG_PATH];
      if (target.type === "Scene") poiUuids = Object.values(patch)[0];
    }),
  };
  return document;
}

afterEach(() => vi.unstubAllGlobals());

describe("Beta adventure folders", () => {
  async function run(order: readonly PreparedBetaMission[]) {
    const folders = new WorldFolders();
    const documents = new Map<string, BetaDocument>();
    vi.stubGlobal("game", { collections: { get: () => ({ contents: [...documents.values()].filter(doc => doc.uuid.startsWith("Item.")) }) } });
    vi.stubGlobal("foundry", { utils: { getDocumentClass: () => undefined },
      data: { operators: { ForcedReplacement: { create: (values: unknown) => values } } } });
    async function execute(missions: readonly PreparedBetaMission[]) {
      const skills = planBetaSkills(missions, EMPTY_CUSTOM_SKILL_CATALOG, false);
      const plan = createBetaDocumentPlan({ missions, maps: {} }, skills, (_mission, path) => path);
      for (const [key, id] of await prepareBetaFolders(plan.routes, folders)()) plan.folders.set(key, id);
      await plan.execute(async (target, parent) => {
        const key = target.type + ":" + target.id;
        if (parent && target.type === "Item") return fakeDocument(target, documents.size);
        const existing = documents.get(key);
        if (existing) return existing;
        const doc = fakeDocument(target, documents.size);
        documents.set(key, doc);
        return doc;
      }, () => {}, async () => {});
      expect(plan.folderWarnings).toEqual([]);
    }

    await execute([order[0]]);
    const firstMission = order[0].mission;
    const otherMissionName = firstMission === "mission1" ? "Missão 2" : "Missão 1";
    expect(folders.records.some(folder => folder.name === otherMissionName)).toBe(false);
    await execute([order[1]]);
    const ids = folders.records.map(folder => folder.id);
    const originalDocuments = [...documents.entries()];
    await execute(order);
    expect(folders.records.map(folder => folder.id)).toEqual(ids);
    expect([...documents.entries()]).toEqual(originalDocuments);
    for (const mission of order) {
      const scene = documents.get("Scene:scene:" + mission.mission)!;
      expect(scene.getFlag("ordemparanormal2", POI_SCENE_ITEMS_FLAG)).toEqual(
        mission.pois.map(poi => documents.get("Item:poi:" + mission.mission + ":" + poi.id)!.uuid));
    }
    return [...documents.values()].filter(doc => /^(Actor|Item)\./u.test(doc.uuid)).map(doc =>
      [doc.name, folders.path(doc.toObject().folder as string)]).sort();
  }

  it("places all POIs and Agents in either mission order without duplicating documents or folders", async () => {
    const mission1 = prepare("mission1");
    const mission2 = prepare("mission2");
    const placements = await run([mission1, mission2]);
    expect(placements).toEqual(await run([mission2, mission1]));
    const root = "Contos da Vigília/";
    for (const [index, mission] of [mission1, mission2].entries()) {
      const path = root + "Missão " + (index + 1);
      for (const poi of mission.pois) expect(placements).toContainEqual([poi.name, path + "/Pontos de Interesse"]);
      for (const threat of mission.threats) expect(placements).toContainEqual([threat.name, path + "/Ameaças"]);
    }
    for (const agent of BETA_AGENTS) {
      const path = agent.page <= 12 ? "Agentes/Compartilhados" : "Missão 2/Agentes";
      expect(placements).toContainEqual([agent.name, root + path]);
    }
    expect(placements).toHaveLength(17 + 8 + 3);
  });

  it("uses the threat's source mission and deduplicates a repeated catalogue reference", async () => {
    const origin = prepare("mission1");
    const repeated = { ...prepare("mission2"), threats: [origin.threats[0]] };
    const missions = [origin, repeated];
    const plan = createBetaDocumentPlan({ missions, maps: {} }, planBetaSkills(missions, EMPTY_CUSTOM_SKILL_CATALOG, false),
      (_mission, path) => path);
    expect(plan.preflight.filter(target => target.source.type === "threat").map(target => target.id))
      .toEqual(["threat:mission1:drowned", "threat:mission1:aughisk"]);
    expect(plan.routes.some(route => route.id === "mission2.threats")).toBe(false);
  });

  it("adopts old folders by provenance and migrates documents in place without touching their content", async () => {
    const folders = new WorldFolders();
    const legacy = (documentId: string) => ({ adventureId: BETA_ID, importer: "Folder", documentId,
      desired: "digest", baseline: "digest", fields: [], version: 1 });
    folders.records.push(
      { id: "actorRoot", type: "Actor", parentId: null, color: null, name: "Pasta renomeada", flag: legacy("folder:Actor") },
      { id: "itemRoot", type: "Item", parentId: null, color: null, name: "Contos da Vigília", flag: legacy("folder:Item") },
      { id: "itemMission", type: "Item", parentId: "itemRoot", color: null, name: "Missão 1", flag: legacy("folder:Item:mission1") },
      { id: "manual", type: "Item", parentId: "itemMission", color: null, name: "Pontos de Interesse", flag: null },
    );
    const agent = betaAgentFolder(true, "mission1");
    const poi = betaPoiFolder("mission1");
    const ids = await prepareBetaFolders([agent, poi], folders)();
    expect(ids.get("Actor:root")).toBe("actorRoot");
    expect(ids.get("Item:mission1")).toBe("itemMission");
    expect(ids.get("Item:" + poi.id)).not.toBe("manual");
    expect(folders.records[0]).toMatchObject({ name: "Pasta renomeada", color: null, flag: { importer: "folder" } });
    expect(folders.records[3].flag).toBeNull();

    for (const route of [agent, poi]) {
      const source = { folder: ids.get(route.type + ":" + route.legacy), system: { health: 7, determination: 2 },
        items: [{ id: "embedded" }], prototypeToken: { actorLink: true }, flags: { anotherSystem: { manual: true } } };
      const target = { type: route.type, id: "stable", name: "Documento", source, managed: {} };
      const doc = fakeDocument(target, 1);
      const uuid = doc.uuid;
      expect(await reconcileBetaFolderPlacement(doc, target, route, ids, () => {})).toBeUndefined();
      expect(doc.toObject()).toEqual({ ...source, folder: ids.get(route.type + ":" + route.id) });
      expect(doc.uuid).toBe(uuid);
      expect(doc.update).toHaveBeenCalledOnce();

      await doc.update({ folder: "manual" });
      expect(await reconcileBetaFolderPlacement(doc, target, route, ids, () => {})).toBeUndefined();
      expect(doc.toObject().folder).toBe("manual");
      const ambiguous = fakeDocument({ ...target, source: { ...source, folder: "manual" } }, 2);
      expect(await reconcileBetaFolderPlacement(ambiguous, target, route, ids, () => {})).toContain(ambiguous.uuid);
      expect(ambiguous.update).not.toHaveBeenCalled();
    }
  });
});
