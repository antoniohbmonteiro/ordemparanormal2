import { afterEach, describe, expect, it, vi } from "vitest";
import { createAdventureAssetStorage } from "./adventure-asset-storage";

const browse = vi.fn();
const createDirectory = vi.fn();
const upload = vi.fn();
const ROOT = "worlds/test-world/ordemparanormal2/adventures/playtest-alpha/act-1";

function setup(existing: readonly string[] = [], files: readonly string[] = []): Set<string> {
  const directories = new Set(["worlds", "worlds/test-world", ...existing]);
  browse.mockImplementation(async (_source: string, target: string) => {
    if (!directories.has(target)) throw new Error(`ENOENT: ${target}`);
    return { target, dirs: [], files };
  });
  createDirectory.mockImplementation(async (_source: string, target: string) => {
    if (directories.has(target)) throw new Error(`EEXIST: ${target}`);
    directories.add(target);
    return {};
  });
  upload.mockResolvedValue({ arbitrary: "public API does not specify response fields" });
  vi.stubGlobal("foundry", { applications: { apps: { FilePicker: { browse, createDirectory, upload } } } });
  vi.stubGlobal("game", { world: { id: "test-world" } });
  return directories;
}

afterEach(() => {
  vi.unstubAllGlobals();
  browse.mockReset();
  createDirectory.mockReset();
  upload.mockReset();
});

describe("Adventure asset storage", () => {
  it("accepts an existing directory by browsing the target directly", async () => {
    setup([ROOT]);
    await createAdventureAssetStorage().ensureDirectories([ROOT]);
    expect(browse).toHaveBeenCalledWith("data", ROOT);
    expect(createDirectory).not.toHaveBeenCalledWith("data", ROOT);
  });

  it("creates a new directory after direct browse confirms it is missing", async () => {
    const directories = setup();
    await createAdventureAssetStorage().ensureDirectories([`${ROOT}/Raiz`]);
    expect(directories.has(`${ROOT}/Raiz`)).toBe(true);
    expect(createDirectory).toHaveBeenCalledWith("data", `${ROOT}/Raiz`);
    expect(browse).toHaveBeenCalledWith("data", `${ROOT}/Raiz`);
  });

  it("accepts EEXIST only when a fresh target browse confirms the directory", async () => {
    const directories = setup();
    const originalCreate = createDirectory.getMockImplementation();
    createDirectory.mockImplementation(async (source: string, target: string) => {
      if (target === ROOT) {
        directories.add(target);
        throw new Error("EEXIST: concurrent mkdir");
      }
      return originalCreate?.(source, target);
    });
    await expect(createAdventureAssetStorage().ensureDirectories([ROOT])).resolves.toBeUndefined();
    expect(browse.mock.calls.filter(([, target]) => target === ROOT)).toHaveLength(2);
  });

  it("propagates EEXIST when a fresh browse still cannot confirm the target", async () => {
    setup();
    const originalCreate = createDirectory.getMockImplementation();
    createDirectory.mockImplementation(async (source: string, target: string) => {
      if (target === ROOT) throw new Error("EEXIST: but target remains unavailable");
      return originalCreate?.(source, target);
    });
    await expect(createAdventureAssetStorage().ensureDirectories([ROOT])).rejects.toThrow(/EEXIST/);
    expect(browse.mock.calls.filter(([, target]) => target === ROOT)).toHaveLength(2);
  });

  it("caches confirmed parents shared by several entries in one materialization", async () => {
    setup();
    const storage = createAdventureAssetStorage();
    await storage.ensureDirectories([`${ROOT}/Raiz/Mapas`, `${ROOT}/Raiz/Retratos`]);
    expect(createDirectory.mock.calls.filter(([, target]) => target === `${ROOT}/Raiz`)).toHaveLength(1);
    expect(browse.mock.calls.filter(([, target]) => target === `${ROOT}/Raiz`)).toHaveLength(1);
  });

  it("reuses the existing tree in a second materialization", async () => {
    setup();
    const tree = `${ROOT}/Raiz/Mapas`;
    await createAdventureAssetStorage().ensureDirectories([tree]);
    const created = createDirectory.mock.calls.length;
    await createAdventureAssetStorage().ensureDirectories([tree]);
    expect(createDirectory).toHaveBeenCalledTimes(created);
    expect(browse).toHaveBeenCalledWith("data", tree);
  });

  it("ignores the upload response shape and returns an unencoded path exposed by browse", async () => {
    setup([ROOT], [`${ROOT}/ação.png`]);
    const storage = createAdventureAssetStorage();
    const file = new File(["image"], "ação.png", { type: "image/png" });
    await expect(storage.uploadAndConfirm(ROOT, file)).resolves.toBe(`${ROOT}/ação.png`);
    expect(upload).toHaveBeenCalledExactlyOnceWith("data", ROOT, file, {}, { notify: false });
    expect(browse).toHaveBeenCalledWith("data", ROOT);
  });

  it("matches spaces in a percent-encoded browse path and returns that original URL", async () => {
    const directory = `${ROOT}/Arquivos para o público - Ato I/Tokens`;
    const storedPath = `${ROOT}/Arquivos%20para%20o%20público%20-%20Ato%20I/Tokens/Personagem%20-%20Kênia.png`;
    setup([directory], [storedPath]);

    await expect(createAdventureAssetStorage().uploadAndConfirm(
      directory, new File(["image"], "Personagem - Kênia.png", { type: "image/png" }),
    )).resolves.toBe(storedPath);
  });

  it("looks up an existing encoded asset without uploading and retains the browse path", async () => {
    const directory = `${ROOT}/Tokens`;
    const storedPath = `${ROOT}/Tokens/Personagem%20-%20K%C3%AAnia.png`;
    setup([directory], [storedPath]);
    await expect(createAdventureAssetStorage().findExisting(
      directory, "Personagem - Kênia.png",
    )).resolves.toBe(storedPath);
    expect(browse).toHaveBeenCalledWith("data", directory);
    expect(upload).not.toHaveBeenCalled();
  });

  it("distinguishes missing files from a failed browse", async () => {
    setup([ROOT], []);
    const storage = createAdventureAssetStorage();
    await expect(storage.findExisting(ROOT, "missing.png")).resolves.toBeNull();
    await expect(storage.findExisting(`${ROOT}/missing`, "missing.png")).rejects.toThrow(/ENOENT/);
  });

  it("matches UTF-8 percent-encoded accents in both directory and filename", async () => {
    const directory = `${ROOT}/Arquivos para o público - Ato I/Tokens`;
    const storedPath = `${ROOT}/Arquivos%20para%20o%20p%C3%BAblico%20-%20Ato%20I/Tokens/Personagem%20-%20K%C3%AAnia.png`;
    setup([directory], [storedPath]);

    await expect(createAdventureAssetStorage().uploadAndConfirm(
      directory, new File(["image"], "Personagem - Kênia.png", { type: "image/png" }),
    )).resolves.toBe(storedPath);
  });

  it("matches a literal plus sign against %2B in the browse filename", async () => {
    const directory = `${ROOT}/Mapas`;
    const storedPath = `${directory}/Mapa%20%2B%20Sala.jpg`;
    setup([directory], [storedPath]);

    await expect(createAdventureAssetStorage().uploadAndConfirm(
      directory, new File(["image"], "Mapa + Sala.jpg", { type: "image/jpeg" }),
    )).resolves.toBe(storedPath);
  });

  it("matches spaces, UTF-8 accents, and %2B together in the Foundry URL", async () => {
    const directory = `${ROOT}/Mapas`;
    const storedPath = `${directory}/Mapa%2003%20-%20O%20Por%C3%A3o%20%2B%20Sala%20Secreta%20%2B%20Duto%20de%20Ventila%C3%A7%C3%A3o%20(completo).jpg`;
    setup([directory], [storedPath]);

    await expect(createAdventureAssetStorage().uploadAndConfirm(
      directory, new File(["image"], "Mapa 03 - O Porão + Sala Secreta + Duto de Ventilação (completo).jpg", { type: "image/jpeg" }),
    )).resolves.toBe(storedPath);
  });

  it("matches Unicode NFC and NFD forms while retaining the browse representation", async () => {
    const directory = `${ROOT}/Tokens`;
    const nfdPath = `${directory}/Ke\u0302nia.png`;
    setup([directory], [nfdPath]);

    await expect(createAdventureAssetStorage().uploadAndConfirm(
      directory, new File(["image"], "Kênia.png", { type: "image/png" }),
    )).resolves.toBe(nfdPath);
  });

  it("normalizes an NFD expected filename against an NFC browse path", async () => {
    const directory = `${ROOT}/Tokens`;
    const nfcPath = `${directory}/Kênia.png`;
    setup([directory], [nfcPath]);

    await expect(createAdventureAssetStorage().uploadAndConfirm(
      directory, new File(["image"], "Ke\u0302nia.png", { type: "image/png" }),
    )).resolves.toBe(nfcPath);
  });

  it("normalizes path separators in the browse candidate", async () => {
    const directory = `${ROOT}/Tokens`;
    const storedPath = `${ROOT}\\Tokens\\Kênia.png`;
    setup([directory], [storedPath]);

    await expect(createAdventureAssetStorage().uploadAndConfirm(
      directory, new File(["image"], "Kênia.png", { type: "image/png" }),
    )).resolves.toBe(storedPath);
  });

  it("skips malformed URIs and can match a later valid candidate", async () => {
    const expectedPath = `${ROOT}/Kênia.png`;
    setup([ROOT], [`${ROOT}/invalid%ZZ.png`, expectedPath]);

    await expect(createAdventureAssetStorage().uploadAndConfirm(
      ROOT, new File(["image"], "Kênia.png", { type: "image/png" }),
    )).resolves.toBe(expectedPath);
  });

  it("does not accept a malformed URI as confirmation", async () => {
    setup([ROOT], [`${ROOT}/K%C3%ZZnia.png`]);

    await expect(createAdventureAssetStorage().uploadAndConfirm(
      ROOT, new File(["image"], "Kênia.png", { type: "image/png" }),
    )).rejects.toThrow(/not found/);
  });

  it("does not turn %2F inside a filename into a directory separator", async () => {
    const directory = `${ROOT}/Mapas`;
    setup([directory], [`${ROOT}/Mapas%2FMapa.jpg`]);

    await expect(createAdventureAssetStorage().uploadAndConfirm(
      directory, new File(["image"], "Mapa.jpg", { type: "image/jpeg" }),
    )).rejects.toThrow(/not found/);
  });

  it("fails when storage renames or does not preserve the expected path", async () => {
    setup([ROOT], [`${ROOT}/image-1.png`]);
    await expect(createAdventureAssetStorage().uploadAndConfirm(
      ROOT, new File(["image"], "image.png", { type: "image/png" }),
    )).rejects.toThrow(/not found/);
  });
});
