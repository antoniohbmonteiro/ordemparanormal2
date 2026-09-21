import { describe, expect, it } from "vitest";
import {
  ensureAdventureFolder, preflightAdventureFolders, type AdventureFolderFlag,
  type AdventureFolderPort, type AdventureFolderSnapshot,
} from "./adventure-folders";

class FakeFolders implements AdventureFolderPort {
  authorized = true;
  readonly world: AdventureFolderSnapshot[] = [];
  isAuthorized() { return this.authorized; }
  listFolders() { return this.world; }
  async createFolder(data: Parameters<AdventureFolderPort["createFolder"]>[0]) {
    const id = `folder-${this.world.length + 1}`;
    this.world.push({ id, name: data.name, color: data.color, type: data.documentType, parentId: data.parentId, flag: data.flag });
    return id;
  }
  async updateFolder(id: string, data: Parameters<AdventureFolderPort["updateFolder"]>[1]) {
    const index = this.world.findIndex(folder => folder.id === id);
    this.world[index] = { ...this.world[index], ...data };
  }
}

const legacy = (importer: "actorFolder" | "handout", folderId: "root" | "actOne" | "actTwo") => ({
  importer, adventureId: "playtest-alpha", folderId, version: 1,
});
const managed = (documentType: "Actor" | "JournalEntry" | "Scene", folderId: "root" | "actOne" | "actTwo"): AdventureFolderFlag => ({
  importer: "folder", adventureId: "playtest-alpha", documentType, folderId, version: 1,
});

describe("Adventure folder policy", () => {
  it("creates only the requested typed tree and ignores manual homonyms", async () => {
    const folders = new FakeFolders();
    folders.world.push({ id: "manual", name: "A Maldição do Ídolo de Pedra", color: null, type: "Actor", parentId: null, flag: null });
    expect(await ensureAdventureFolder({ adventureId: "playtest-alpha", documentType: "Actor", act: "actOne", folders })).toBe("folder-3");
    expect(folders.world).toHaveLength(3);
    expect(folders.world.slice(1)).toMatchObject([
      { type: "Actor", parentId: null, name: "A Maldição do Ídolo de Pedra", color: "#7a2424", flag: { importer: "folder", folderId: "root" } },
      { type: "Actor", parentId: "folder-2", name: "Ato I", color: "#4f2525", flag: { folderId: "actOne" } },
    ]);
    await ensureAdventureFolder({ adventureId: "playtest-alpha", documentType: "Actor", act: "actOne", folders });
    expect(folders.world).toHaveLength(3);
  });

  it("reuses and reconciles valid legacy folders without changing IDs", async () => {
    const folders = new FakeFolders();
    folders.world.push(
      { id: "old-root", name: "Ordem Paranormal 2 — Playtest Alpha", color: null, type: "JournalEntry", parentId: null, flag: legacy("handout", "root") },
      { id: "old-act", name: "Velho Ato I", color: null, type: "JournalEntry", parentId: "old-root", flag: legacy("handout", "actOne") },
    );
    expect(await ensureAdventureFolder({ adventureId: "playtest-alpha", documentType: "JournalEntry", act: "actOne", folders })).toBe("old-act");
    expect(folders.world).toMatchObject([
      { id: "old-root", name: "A Maldição do Ídolo de Pedra", color: "#7a2424", flag: { importer: "folder", documentType: "JournalEntry" } },
      { id: "old-act", name: "Ato I", color: "#4f2525", flag: { importer: "folder", documentType: "JournalEntry" } },
    ]);
  });

  it.each([
    ["duplicate", [
      { id: "a", name: "a", color: null, type: "Scene", parentId: null, flag: managed("Scene", "root") },
      { id: "b", name: "b", color: null, type: "Scene", parentId: null, flag: managed("Scene", "root") },
    ]],
    ["type", [{ id: "a", name: "a", color: null, type: "Actor", parentId: null, flag: managed("Scene", "root") }]],
    ["parent", [
      { id: "root", name: "r", color: null, type: "Scene", parentId: null, flag: managed("Scene", "root") },
      { id: "act", name: "a", color: null, type: "Scene", parentId: "wrong", flag: managed("Scene", "actOne") },
    ]],
    ["malformed", [{ id: "a", name: "a", color: null, type: "Scene", parentId: null,
      flag: { importer: "folder", documentType: "Scene", folderId: "root", version: 1 } }]],
  ] as const)("rejects %s conflicts before writes", (_kind, world) => {
    const folders = new FakeFolders(); folders.world.push(...world);
    expect(() => preflightAdventureFolders({ adventureId: "playtest-alpha", requirements: [{ documentType: "Scene", acts: ["actOne"] }], folders })).toThrow();
  });
});
