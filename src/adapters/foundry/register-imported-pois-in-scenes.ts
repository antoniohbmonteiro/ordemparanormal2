import type { AdventureAct } from "../../core/adventure-import/recognize-zip-source";
import { POI_SCENE_ITEMS_PATH, readScenePoiUuids } from "./points-of-interest/poi-runtime-state";

interface ImportedReference { readonly id: string; readonly act: AdventureAct }

/** Registers only exact importer identities in the existing GM Scene catalog. */
export async function registerImportedPoisInScenes(
  adventureId: string, pois: readonly ImportedReference[], scenes: readonly ImportedReference[], acts: readonly AdventureAct[],
): Promise<readonly string[]> {
  const warnings: string[] = [];
  const imported = (document: { getFlag(scope: string, key: string): unknown }, documentId: string): boolean => {
    const flag = document.getFlag("ordemparanormal2", "adventureImport");
    return !!flag && typeof flag === "object" && !Array.isArray(flag)
      && (flag as Record<string, unknown>).adventureId === adventureId
      && (flag as Record<string, unknown>).documentId === documentId;
  };
  for (const act of acts) {
    const sceneRefs = scenes.filter(scene => scene.act === act);
    const scene = sceneRefs.length === 1
      ? game.scenes.contents.filter((candidate: foundry.documents.Scene) => imported(candidate, sceneRefs[0].id)) : [];
    if (scene.length !== 1) { warnings.push(`Scene não identificada unicamente para ${act}.`); continue; }
    const uuids: string[] = [];
    let ambiguous = false;
    for (const poi of pois.filter(candidate => candidate.act === act)) {
      const matches = game.items.contents.filter((item: foundry.documents.Item) => item.type === "pointOfInterest" && imported(item, poi.id));
      if (matches.length !== 1) { ambiguous = true; continue; }
      uuids.push(matches[0].uuid);
    }
    if (ambiguous) warnings.push(`Alguns POIs de ${act} não foram identificados unicamente.`);
    const current = readScenePoiUuids(scene[0]);
    const next = [...new Set([...current, ...uuids])];
    if (next.length !== current.length) await scene[0].update({
      [POI_SCENE_ITEMS_PATH]: foundry.data.operators.ForcedReplacement.create(next),
    });
  }
  return warnings;
}
