import { safeZipEntryPath } from "../../core/adventure-import/safe-zip-entry-path";
import type { AdventureAct } from "../../core/adventure-import/recognize-zip-source";

const ACT_FOLDER: Record<AdventureAct, string> = { actOne: "act-1", actTwo: "act-2" };

export function adventureAs09Root(worldId: string): string {
  const world = safeZipEntryPath(worldId);
  if (world.directory || world.isDirectory) throw new Error("Invalid World ID");
  return `worlds/${world.relativePath}/ordemparanormal2/adventures/playtest-alpha/as09/v1`;
}

export function adventureActRoot(worldId: string, act: AdventureAct): string {
  return `worlds/${worldId}/ordemparanormal2/adventures/playtest-alpha/${ACT_FOLDER[act]}`;
}

export function adventureDerivedAssetLocation(worldId: string, act: AdventureAct, basename: string):
  { readonly directory: string; readonly basename: string } {
  const safe = safeZipEntryPath(basename);
  if (safe.isDirectory || safe.basename !== basename || safe.directory) throw new Error(`Invalid derived asset basename: ${basename}`);
  return { directory: adventureActRoot(worldId, act), basename };
}

export function adventureEntryLocation(
  worldId: string, act: AdventureAct, originalEntryPath: string,
): { readonly directory: string; readonly basename: string } {
  const entry = safeZipEntryPath(originalEntryPath);
  if (entry.isDirectory) throw new Error(`Asset reference is a directory: ${originalEntryPath}`);
  const root = adventureActRoot(worldId, act);
  return { directory: entry.directory ? `${root}/${entry.directory}` : root, basename: entry.basename };
}
