import { safeZipEntryPath } from "../../core/adventure-import/safe-zip-entry-path";

export interface AdventureAssetLookup {
  readonly worldId: string;
  findExisting(directory: string, basename: string): Promise<string | null>;
}

export interface AdventureAssetStorage extends AdventureAssetLookup {
  ensureDirectories(directories: readonly string[]): Promise<void>;
  uploadAndConfirm(directory: string, file: File): Promise<string>;
}

function normalizeStoragePath(path: string): string {
  return path.replaceAll("\\", "/").normalize("NFC");
}

function normalizeBrowsePath(path: string): string | null {
  try {
    const segments = path.replaceAll("\\", "/").split("/").map((segment) => decodeURIComponent(segment));
    if (segments.some((segment) => segment.includes("/"))) return null;
    return segments.join("/").normalize("NFC");
  } catch {
    return null;
  }
}

function matchesExpectedPath(candidate: string, expected: string): boolean {
  return normalizeBrowsePath(candidate) === expected;
}

export function createAdventureAssetStorage(): AdventureAssetStorage {
  const FilePicker = foundry.applications.apps.FilePicker;
  const confirmedDirectories = new Set<string>();

  async function findExisting(directory: string, basename: string): Promise<string | null> {
    const safeBasename = safeZipEntryPath(basename).basename;
    if (safeBasename !== basename) throw new Error(`Expected a filename: ${basename}`);
    const listing = await FilePicker.browse("data", directory);
    const expected = normalizeStoragePath(`${directory}/${safeBasename}`);
    return listing.files.find((candidate) => matchesExpectedPath(candidate, expected)) ?? null;
  }

  async function ensureDirectory(target: string): Promise<void> {
    if (confirmedDirectories.has(target)) return;
    try {
      await FilePicker.browse("data", target);
      confirmedDirectories.add(target);
      return;
    } catch {
      // A missing target cannot be inferred from a parent's directory listing.
    }

    try {
      await FilePicker.createDirectory("data", target);
      confirmedDirectories.add(target);
    } catch (error) {
      if (!(error instanceof Error && /\bEEXIST\b/.test(error.message))) throw error;
      try {
        await FilePicker.browse("data", target);
        confirmedDirectories.add(target);
      } catch {
        throw error;
      }
    }
  }

  return {
    worldId: game.world.id,
    findExisting,
    async ensureDirectories(directories) {
      for (const directory of directories) {
        const parts = directory.split("/");
        for (let index = 2; index <= parts.length; index++) {
          const target = parts.slice(0, index).join("/");
          await ensureDirectory(target);
        }
      }
    },
    async uploadAndConfirm(directory, file) {
      const basename = safeZipEntryPath(file.name).basename;
      const expected = `${directory}/${basename}`;
      await FilePicker.upload("data", directory, file, {}, { notify: false });
      const storedPath = await findExisting(directory, basename);
      if (storedPath === null) {
        throw new Error(`Uploaded file was not found at expected path: ${expected}`);
      }
      return storedPath;
    },
  };
}
