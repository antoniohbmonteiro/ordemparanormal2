import type { HandlebarsRenderOptions } from "@client/applications/api/handlebars-application.mjs";
import { POINT_OF_INTEREST_ITEM_TYPE } from "../../../config/system-config";
import { resolvePoiImagePreview } from "./poi-image-preview";

interface ItemDirectoryTree {
  readonly entries: readonly foundry.documents.Item<null>[];
  readonly children: readonly ItemDirectoryTree[];
}
const registered = new WeakSet<Function>();

function isTree(value: unknown): value is ItemDirectoryTree {
  if (!value || typeof value !== "object") return false;
  const tree = value as Partial<ItemDirectoryTree>;
  return Array.isArray(tree.entries) && tree.entries.every(entry => entry && typeof entry === "object")
    && Array.isArray(tree.children) && tree.children.every(isTree);
}
async function previewTree(tree: ItemDirectoryTree): Promise<ItemDirectoryTree> {
  const entries = await Promise.all(tree.entries.map(async entry => {
    if (entry.type !== POINT_OF_INTEREST_ITEM_TYPE || !entry.img) return entry;
    const src = entry.img;
    const preview = await resolvePoiImagePreview(src);
    if (preview === src || entry.img !== src) return entry;
    // Render-only facade: native getters/methods keep their actual Document receiver.
    return new Proxy(entry, { get(target, key): unknown {
      if (key === "thumbnail") return preview;
      const value: unknown = Reflect.get(target, key, target);
      return typeof value === "function" && key !== "constructor" ? value.bind(target) : value;
    } });
  }));
  return { ...tree, entries, children: await Promise.all(tree.children.map(previewTree)) };
}

/** Extend the configured v14 directory through its documented preparation method.
 * The collection.tree shape (entries/children) is verified against v14.367, but
 * omitted from installed typings. Keep that translation here, without DOM selectors.
 */
export function registerPoiItemDirectoryPreviews(): void {
  // The project's CONFIG.ui shim types registered constructors as unknown.
  const uiConfig = CONFIG.ui as { items: ConstructorOf<foundry.applications.sidebar.tabs.ItemDirectory> };
  const Base = uiConfig.items;
  if (registered.has(Base)) return;
  class PoiItemDirectory extends Base {
    protected override async _prepareDirectoryContext(context: object, options: HandlebarsRenderOptions): Promise<void> {
      await super._prepareDirectoryContext(context, options);
      const presentation = context as { tree?: unknown };
      if (isTree(presentation.tree)) presentation.tree = await previewTree(presentation.tree);
    }
  }
  registered.add(PoiItemDirectory);
  uiConfig.items = PoiItemDirectory;
}
