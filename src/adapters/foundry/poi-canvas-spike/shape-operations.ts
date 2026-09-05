import type Canvas from "@client/canvas/board.mjs";
import type RegionDocument from "@client/documents/region.mjs";
import { SYSTEM_ID } from "../../../config/system-config";
import { POI_SPIKE_FLAG, readPoiSpikePlacement } from "./placement";

export type PoiSpikeShapeOperation = "addPositive" | "addHole" | "repositionLast" | "removeLast" | "lastFirst";

export function findPoiSpikeShapeTarget(board: Canvas): RegionDocument | null {
  if (!board.scene) return null;
  const marked = (region: RegionDocument) =>
    readPoiSpikePlacement(region.getFlag(SYSTEM_ID, POI_SPIKE_FLAG)) !== null;
  const selected = board.regions.controlled.map((object) => object.document as RegionDocument).filter(marked);
  if (selected.length === 1) return selected[0];
  if (selected.length > 1) return null;
  const candidates = [...board.scene.regions].filter(marked);
  return candidates.length === 1 ? candidates[0] : null;
}

export async function editPoiSpikeShapes(
  board: Canvas,
  region: RegionDocument,
  operation: PoiSpikeShapeOperation,
): Promise<void> {
  const scene = board.scene;
  const placement = readPoiSpikePlacement(region.getFlag(SYSTEM_ID, POI_SPIKE_FLAG));
  if (!game.user.isGM || !board.ready || !scene || !placement
    || scene.regions.get(region.id) !== region) return;

  const shapes = region.toObject().shapes;
  const before = JSON.stringify(shapes);
  if (operation === "removeLast") {
    // Keep the disposable target usable for further shape experiments.
    if (shapes.length < 2) return;
    shapes.pop();
  } else if (operation === "lastFirst") {
    if (shapes.length < 2) return;
    shapes.unshift(shapes.pop()!);
  } else {
    const last = shapes.at(-1);
    if (operation === "repositionLast" && !last) return;
    const hole = operation === "addHole" || (operation === "repositionLast" && last!.hole);
    // A hole-only preview has no positive area. Position a positive preview,
    // then apply its subtractive role only when updating the existing Region.
    const shape = operation === "repositionLast"
      ? { ...last!, hole: false }
      : { type: "circle" as const, x: 0, y: 0, radius: hole ? 20 : 80, hole: false };
    ui.notifications.info(`Posicione ${hole ? "o recorte" : "a Shape"} na mesma Region POI. Clique confirma; Esc cancela.`);
    const preview = await board.regions.placeRegion({
      name: "POI — preview de Shape",
      shapes: [shape],
      restriction: { enabled: false },
      levels: [...region.levels],
    }, { create: false });
    if (!preview) return;
    const positioned = preview.toObject().shapes[0];
    if (!positioned) return;
    if (operation === "repositionLast") shapes[shapes.length - 1] = { ...positioned, hole };
    else shapes.push({ ...positioned, hole });
  }

  // Do not overwrite edits made while the native preview was open, or write
  // into a deleted/unmarked target or a Scene that is no longer viewed.
  if (!game.user.isGM || !board.ready || board.scene !== scene
    || scene.regions.get(region.id) !== region
    || readPoiSpikePlacement(region.getFlag(SYSTEM_ID, POI_SPIKE_FLAG))?.itemUuid !== placement.itemUuid
    || JSON.stringify(region.toObject().shapes) !== before) {
    ui.notifications.warn("O alvo ou suas Shapes mudaram durante o teste. Tente novamente.");
    return;
  }
  await region.update({ shapes });
}
