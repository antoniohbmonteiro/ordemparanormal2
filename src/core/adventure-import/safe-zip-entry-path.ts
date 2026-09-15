export interface SafeZipEntryPath {
  readonly originalPath: string;
  readonly relativePath: string;
  readonly directory: string;
  readonly basename: string;
  readonly isDirectory: boolean;
}

const RESERVED_WINDOWS_NAME = /^(?:con|prn|aux|nul|com[0-9¹²³]|lpt[0-9¹²³])(?:\..*)?$/i;
const ENCODED_PATH_CHARACTER = /%[0-9a-f]{2}/i;

export function safeZipEntryPath(originalPath: string): SafeZipEntryPath {
  if (!originalPath || /^[\\/]/.test(originalPath) || /^[a-zA-Z]:/.test(originalPath)) {
    throw new Error(`Unsafe ZIP entry path: ${originalPath}`);
  }
  if (/[\x00-\x1f\x7f"*:<>?|#]/.test(originalPath) || ENCODED_PATH_CHARACTER.test(originalPath)) {
    throw new Error(`Unsupported ZIP entry path: ${originalPath}`);
  }

  const isDirectory = /[\\/]$/.test(originalPath);
  const relativePath = originalPath.replace(/\\/g, "/").replace(/\/$/, "");
  const segments = relativePath.split("/");
  if (segments.some((segment) =>
    !segment || segment === "." || segment === ".." || /[. ]$/.test(segment) || RESERVED_WINDOWS_NAME.test(segment)
  )) {
    throw new Error(`Unsafe ZIP entry path: ${originalPath}`);
  }

  return {
    originalPath,
    relativePath,
    directory: segments.slice(0, -1).join("/"),
    basename: segments.at(-1) ?? "",
    isDirectory,
  };
}

export function assertDistinctZipPaths(paths: readonly SafeZipEntryPath[]): void {
  const seen = new Map<string, string>();
  for (const path of paths) {
    const key = path.relativePath.normalize("NFC").toLocaleLowerCase("en-US");
    const previous = seen.get(key);
    if (previous) throw new Error(`Colliding ZIP entries: ${previous} and ${path.originalPath}`);
    seen.set(key, path.originalPath);
  }
  const fileKeys = new Set(paths.filter((path) => !path.isDirectory)
    .map((path) => path.relativePath.normalize("NFC").toLocaleLowerCase("en-US")));
  for (const path of paths) {
    const segments = path.relativePath.normalize("NFC").toLocaleLowerCase("en-US").split("/");
    for (let index = 1; index < segments.length; index++) {
      if (fileKeys.has(segments.slice(0, index).join("/"))) {
        throw new Error(`ZIP file conflicts with a directory: ${path.originalPath}`);
      }
    }
  }
}
