import { safeZipEntryPath } from "../../core/adventure-import/safe-zip-entry-path";

export interface AdventureAssetLookup {
  readonly worldId: string;
  findExisting(directory: string, basename: string): Promise<string | null>;
}

export interface AdventureAssetStorage extends AdventureAssetLookup {
  ensureDirectories(directories: readonly string[]): Promise<void>;
  uploadAndConfirm(directory: string, file: File): Promise<string>;
}

function candidateSegments(path: string): { segments: string[]; absolute: boolean } | null {
  let pathname = path;
  let absolute = false;
  if (/^[a-z][a-z\d+.-]*:/i.test(path)) {
    try {
      const url = new URL(path);
      if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.hash) return null;
      // Keep the raw pathname so URL parsing cannot hide traversal segments.
      const match = /^https?:\/\/[^/?#]+(\/[^?#]*)?(?:\?[^#]*)?$/i.exec(path);
      if (!match || path.includes("\\")) return null;
      pathname = match[1] ?? "/";
      absolute = true;
    } catch {
      return null;
    }
  } else if (path.startsWith("//") || path.includes("?") || path.includes("#")) {
    return null;
  }

  try {
    const rawSegments = pathname.replaceAll("\\", "/").split("/");
    if (absolute) rawSegments.shift();
    if (rawSegments.some((segment) => segment.length === 0)) return null;
    const segments = rawSegments.map((segment) => decodeURIComponent(segment).normalize("NFC"));
    if (segments.some((segment) => segment === "." || segment === ".."
      || /[\\/\u0000-\u001F\u007F]/u.test(segment))) return null;
    return { segments, absolute };
  } catch {
    return null;
  }
}

function matchesExpectedPath(candidate: string, expected: string): boolean {
  const parsed = candidateSegments(candidate);
  if (!parsed) return false;
  const expectedSegments = expected.replaceAll("\\", "/").split("/").map((segment) => segment.normalize("NFC"));
  if (parsed.segments.length < expectedSegments.length) return false;
  if (!parsed.absolute && parsed.segments.length !== expectedSegments.length) return false;
  return expectedSegments.every((segment, index) =>
    parsed.segments[parsed.segments.length - expectedSegments.length + index] === segment);
}

export function createAdventureAssetStorage(): AdventureAssetStorage {
  const FilePicker = foundry.applications.apps.FilePicker;
  const confirmedDirectories = new Set<string>();

  async function findExisting(directory: string, basename: string): Promise<string | null> {
    const safeBasename = safeZipEntryPath(basename).basename;
    if (safeBasename !== basename) throw new Error(`Expected a filename: ${basename}`);
    const listing = await FilePicker.browse("data", directory);
    const expected = `${directory}/${safeBasename}`;
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
      const response = await FilePicker.upload("data", directory, file, {}, { notify: false });
      if (response && "path" in response && typeof response.path === "string"
        && matchesExpectedPath(response.path, expected)) return response.path;
      const storedPath = await findExisting(directory, basename);
      if (storedPath === null) {
        throw new Error(`Uploaded file was not found at expected path: ${expected}`);
      }
      return storedPath;
    },
  };
}
