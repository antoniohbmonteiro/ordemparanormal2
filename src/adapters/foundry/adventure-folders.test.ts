import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAdventureFolderPort } from "./adventure-folders";

const create = vi.fn();
const update = vi.fn();
const legacyFlag = { importer: "actorFolder", adventureId: "playtest-alpha", folderId: "root", version: 1 };
const folder = {
  id: "folder-id",
  getFlag: vi.fn(() => legacyFlag),
  toObject: vi.fn(() => ({ name: "Old", color: null, type: "Actor", folder: null })),
  update,
};

beforeEach(() => {
  create.mockReset().mockResolvedValue({ id: "created" }); update.mockReset().mockResolvedValue(folder);
  vi.stubGlobal("game", { user: { id: "gm", isGM: true }, users: { activeGM: { id: "gm" } },
    folders: { contents: [folder], get: vi.fn(() => folder) } });
  vi.stubGlobal("foundry", { documents: { Folder: { create } } });
});
afterEach(() => vi.unstubAllGlobals());

describe("Foundry Adventure Folder adapter", () => {
  it("reads native type, parent and color and creates through the public Folder API", async () => {
    const port = createAdventureFolderPort();
    expect(port.listFolders()).toEqual([{ id: "folder-id", name: "Old", color: null, type: "Actor", parentId: null, flag: legacyFlag }]);
    const flag = { importer: "folder" as const, version: 1 as const, adventureId: "playtest-alpha",
      documentType: "Scene" as const, folderId: "actOne" as const };
    expect(await port.createFolder({ name: "Ato I", color: "#4f2525", documentType: "Scene", parentId: "root", flag })).toBe("created");
    expect(create).toHaveBeenCalledWith({ name: "Ato I", color: "#4f2525", type: "Scene", folder: "root",
      flags: { ordemparanormal2: { adventureImport: flag } } });
  });

  it("updates only managed presentation and provenance fields", async () => {
    const port = createAdventureFolderPort();
    const flag = { importer: "folder" as const, version: 1 as const, adventureId: "playtest-alpha",
      documentType: "Actor" as const, folderId: "root" as const };
    folder.getFlag.mockReturnValue(flag);
    folder.toObject.mockReturnValue({ name: "A Maldição do Ídolo de Pedra", color: "#7a2424", type: "Actor", folder: null } as never);
    await port.updateFolder("folder-id", { name: "A Maldição do Ídolo de Pedra", color: "#7a2424", flag });
    expect(update).toHaveBeenCalledWith({ name: "A Maldição do Ídolo de Pedra", color: "#7a2424",
      "flags.ordemparanormal2.adventureImport": flag });
  });
});
