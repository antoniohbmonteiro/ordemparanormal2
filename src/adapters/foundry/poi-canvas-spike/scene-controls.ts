import type { SceneControl } from "@client/applications/ui/scene-controls.mjs";
import type Canvas from "@client/canvas/board.mjs";
import { SYSTEM_ID } from "../../../config/system-config";
import { createPoiSpikeRegionData } from "./placement";
import { editPoiSpikeShapes, findPoiSpikeShapeTarget, type PoiSpikeShapeOperation } from "./shape-operations";

// The installed Foundry typings omit the public canvas global.
declare const canvas: Canvas;

let placing = false;

export async function editPoiSpikeRegion(operation: PoiSpikeShapeOperation): Promise<void> {
  if (!game.user.isGM || !canvas.ready || !canvas.scene || placing) return;
  const region = findPoiSpikeShapeTarget(canvas);
  if (!region) {
    ui.notifications.warn("Selecione uma única Region POI, ou use uma Scene com apenas um POI de teste.");
    return;
  }
  placing = true;
  try {
    await editPoiSpikeShapes(canvas, region, operation);
  } finally {
    placing = false;
  }
}

export async function placePoiSpikeRegion(): Promise<void> {
  if (!game.user.isGM || !canvas.ready || !canvas.scene || placing) return;
  const source = (game as typeof game & {
    items: Iterable<foundry.documents.Item>;
  }).items;
  const item = [...source].find((candidate) => candidate.type === "pointOfInterest");
  if (!item) {
    ui.notifications.warn("Crie um Item Ponto de Interesse no mundo antes deste teste.");
    return;
  }

  placing = true;
  try {
    ui.notifications.info("Posicione o POI de teste: clique confirma; Esc cancela. A roda gira a forma.");
    await canvas.regions.placeRegion({
      ...createPoiSpikeRegionData(item.uuid),
      visibility: CONST.REGION_VISIBILITY.LAYER,
      ownership: { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE },
      levels: canvas.level ? [canvas.level.id] : [],
    }, { create: true, createOptions: { renderSheet: false } });
  } finally {
    placing = false;
  }
}

export function addPoiSpikeSceneControls(controls: Record<string, SceneControl>): void {
  if (!game.user.isGM) return;
  controls.poiCanvasSpike = {
    name: "poiCanvasSpike",
    title: "Pontos de Interesse (spike)",
    icon: "fa-solid fa-magnifying-glass-location",
    order: Object.keys(controls).length,
    activeTool: "place",
    tools: {
      place: {
        name: "place",
        title: "Colocar POI de teste",
        icon: "fa-solid fa-location-dot",
        order: 0,
        button: true,
        onChange: () => {
          void placePoiSpikeRegion().catch((error: unknown) => {
            console.error(`${SYSTEM_ID} | POI canvas spike placement failed`, error);
            ui.notifications.error("Não foi possível colocar o POI de teste. Consulte o console.");
          });
        },
      },
    },
  };
  const operations: [PoiSpikeShapeOperation, string, string][] = [
    ["addPositive", "Adicionar Shape ao POI", "fa-solid fa-circle-plus"],
    ["addHole", "Adicionar hole ao POI", "fa-regular fa-circle"],
    ["repositionLast", "Reposicionar última Shape do POI", "fa-solid fa-arrows-up-down-left-right"],
    ["removeLast", "Remover última Shape do POI", "fa-solid fa-minus"],
    ["lastFirst", "Mover última Shape do POI para o início", "fa-solid fa-arrow-up"],
  ];
  for (const [index, [operation, title, icon]] of operations.entries()) {
    controls.poiCanvasSpike.tools[operation] = {
      name: operation, title, icon, order: index + 1, button: true,
      onChange: () => {
        void editPoiSpikeRegion(operation).catch((error: unknown) => {
          console.error(`${SYSTEM_ID} | POI shape spike failed`, error);
          ui.notifications.error("Não foi possível editar as Shapes do POI. Consulte o console.");
        });
      },
    };
  }
}
