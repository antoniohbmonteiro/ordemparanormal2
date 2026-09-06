import { SYSTEM_ID } from "../../../config/system-config";

export const POI_CONTROL_NAME = "ordemparanormal2-poi";
export const POI_DRAWING_TOOLS = ["createRectangle", "createEllipse", "createPolygon"] as const;

interface RegionSheetState { readonly rendered: boolean; readonly state: number }
interface DrawingRegion {
  readonly id: string | null;
  readonly parent: { readonly id: string } | null;
  readonly sheet: RegionSheetState;
}
// Public v14 members absent from the installed canvas/UI declarations.
interface DrawingEnvironment {
  readonly canvas?: {
    readonly ready: boolean;
    readonly scene: { readonly id: string; readonly regions: Iterable<DrawingRegion> } | null;
    readonly regions: { readonly active: boolean; releaseAll(): number };
  };
  readonly ui: {
    readonly controls: {
      readonly control?: { readonly name: string };
      readonly tool?: { readonly name: string };
      activate(options: { control: string; tool: string }): Promise<void>;
    };
    readonly notifications: { warn(message: string): unknown; error(message: string): unknown };
  };
}
const environment = () => globalThis as typeof globalThis & DrawingEnvironment;
const localize = (key: string) => game.i18n.localize(`ORDEMPARANORMAL2.PointOfInterest.SceneControls.${key}`);
let activating = false;

function isDrawing(): boolean {
  const { ui } = environment();
  return !!game.user?.isGM && ui.controls.control?.name === POI_CONTROL_NAME
    && POI_DRAWING_TOOLS.some(tool => tool === ui.controls.tool?.name);
}

function hasOpenRegionConfig(): boolean {
  const { canvas } = environment();
  const rendering = foundry.applications.api.ApplicationV2.RENDER_STATES.RENDERING;
  return !!canvas?.scene && [...canvas.scene.regions].some(region =>
    region.sheet.rendered || region.sheet.state === rendering);
}

async function cancelDrawing(message: string): Promise<void> {
  await environment().ui.controls.activate({ control: POI_CONTROL_NAME, tool: "selectPoi" });
  environment().ui.notifications.warn(localize(message));
}

export async function preparePoiDrawing(toolName: string): Promise<void> {
  const { canvas, ui } = environment();
  if (activating || !canvas?.ready || !isDrawing() || ui.controls.tool?.name !== toolName) return;
  if (hasOpenRegionConfig()) { await cancelDrawing("CloseRegionConfig"); return; }
  activating = true;
  try {
    canvas.regions.releaseAll();
    if (!canvas.regions.active) {
      const native = foundry.canvas.layers.RegionLayer.prepareSceneControls();
      // The native group activates its layer. Calling RegionLayer.activate from our group
      // would start a second, unawaited SceneControls activation inside Foundry.
      await ui.controls.activate({ control: native.name, tool: "select" });
      if (ui.controls.control?.name !== native.name || ui.controls.tool?.name !== "select") return;
      if (hasOpenRegionConfig()) { await cancelDrawing("CloseRegionConfig"); return; }
      canvas.regions.releaseAll();
      await ui.controls.activate({ control: POI_CONTROL_NAME, tool: toolName });
    }
  } finally {
    activating = false;
  }
}

export function onPoiToolChange(_event: Event, tool: { readonly name: string }, active = false): void {
  if (!active || activating || !POI_DRAWING_TOOLS.some(name => name === tool.name)) return;
  // Let the current SceneControls callback finish before requesting another activation.
  void Promise.resolve().then(() => preparePoiDrawing(tool.name)).catch(error => {
    console.error(`${SYSTEM_ID} | Failed to activate POI drawing`, error);
    environment().ui.notifications.error(localize("ActivationFailed"));
  });
}

export function protectPoiDrawingFromControl(value: unknown, controlled: unknown): void {
  const region = (value as { document?: DrawingRegion } | null)?.document;
  if (!controlled || !region?.id || region.parent?.id !== environment().canvas?.scene?.id || !isDrawing()) return;
  void cancelDrawing("DrawingCancelled");
}

export function protectPoiDrawingFromConfig(value: unknown): void {
  const region = (value as { document?: DrawingRegion } | null)?.document;
  if (!region?.id || region.parent?.id !== environment().canvas?.scene?.id || !isDrawing()) return;
  void cancelDrawing("DrawingCancelled");
}
