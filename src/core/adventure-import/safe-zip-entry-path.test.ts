import { describe, expect, it } from "vitest";
import { assertDistinctZipPaths, safeZipEntryPath } from "./safe-zip-entry-path";

describe("safeZipEntryPath", () => {
  it("preserves ordinary and accented paths while normalizing backslash separators", () => {
    expect(safeZipEntryPath("Raiz\\Retratos\\ação.png")).toMatchObject({
      originalPath: "Raiz\\Retratos\\ação.png",
      relativePath: "Raiz/Retratos/ação.png",
      directory: "Raiz/Retratos",
      basename: "ação.png",
      isDirectory: false,
    });
    expect(safeZipEntryPath("Raiz/Imagens/").isDirectory).toBe(true);
  });

  it.each([
    "../escape.png", "a/../escape.png", "a\\..\\escape.png", "/absolute.png",
    "\\absolute.png", "C:\\escape.png", "a//b.png", "a/./b.png",
    "a/%2e%2e/b.png", "a/%2f/b.png", "a/con.png", "a/name. ",
  ])("rejects unsafe or incompatible path %s", (path) => {
    expect(() => safeZipEntryPath(path)).toThrow();
  });

  it("rejects names that collide on common storage filesystems", () => {
    expect(() => assertDistinctZipPaths([
      safeZipEntryPath("Mapas/Ação.png"), safeZipEntryPath("mapas/Ação.png"),
    ])).toThrow(/Colliding/);
    expect(() => assertDistinctZipPaths([
      safeZipEntryPath("Raiz"), safeZipEntryPath("Raiz/file.png"),
    ])).toThrow(/conflicts/);
  });
});
