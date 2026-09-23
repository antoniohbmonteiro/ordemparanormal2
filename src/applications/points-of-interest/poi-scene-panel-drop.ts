import { isGmControlledPoi, isWorldPoiUuid, readScenePoiUuids, worldPoi } from "../../adapters/foundry/points-of-interest/poi-runtime-state";

export type PoiSceneDrop = { readonly kind: "invalid" } | { readonly kind: "duplicate"; readonly itemUuid: string }
  | { readonly kind: "valid"; readonly itemUuid: string };

export function classifyPoiSceneDrop(data: Record<string, unknown>, sceneId: string): PoiSceneDrop {
  if (data.type !== "Item" || !isWorldPoiUuid(data.uuid)) return { kind: "invalid" };
  const scene = game.scenes.get(sceneId);
  const item = worldPoi(data.uuid);
  if (!scene || !item || !isGmControlledPoi(item)) return { kind: "invalid" };
  return readScenePoiUuids(scene).includes(data.uuid)
    ? { kind: "duplicate", itemUuid: data.uuid }
    : { kind: "valid", itemUuid: data.uuid };
}

/** Foundry's public drag payload reader is authoritative at drop time. */
function dragData(event: DragEvent): Record<string, unknown> {
  try { return foundry.applications.ux.TextEditor.implementation.getDragEventData(event); }
  catch { return {}; }
}

export function listenPoiScenePanelDrop(
  root: HTMLElement,
  sceneId: string,
  add: (itemUuid: string) => Promise<void>,
  duplicate: () => void,
): () => void {
  let preview: Record<string, unknown> = {};
  const clear = () => root.classList.remove("is-drag-over");
  const onDragStart = (event: DragEvent) => { preview = dragData(event); };
  const onDragOver = (event: DragEvent) => {
    // The browser can hide transfer data during dragover; accept the drop zone and validate at drop time.
    event.preventDefault();
    const data = dragData(event);
    const candidate = classifyPoiSceneDrop(Object.keys(data).length ? data : preview, sceneId);
    if (candidate.kind === "invalid") { clear(); return; }
    if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
    root.classList.toggle("is-drag-over", candidate.kind === "valid");
  };
  const onDragLeave = (event: DragEvent) => {
    if (!root.contains(event.relatedTarget as Node | null)) clear();
  };
  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    clear();
    preview = {};
    const candidate = classifyPoiSceneDrop(dragData(event), sceneId);
    if (candidate.kind === "invalid") return;
    if (candidate.kind === "duplicate") duplicate();
    else void add(candidate.itemUuid);
  };
  const onDragEnd = () => { preview = {}; clear(); };
  document.addEventListener("dragstart", onDragStart);
  document.addEventListener("dragend", onDragEnd);
  root.addEventListener("dragover", onDragOver);
  root.addEventListener("dragleave", onDragLeave);
  root.addEventListener("drop", onDrop);
  return () => {
    document.removeEventListener("dragstart", onDragStart);
    document.removeEventListener("dragend", onDragEnd);
    root.removeEventListener("dragover", onDragOver);
    root.removeEventListener("dragleave", onDragLeave);
    root.removeEventListener("drop", onDrop);
    clear();
  };
}
