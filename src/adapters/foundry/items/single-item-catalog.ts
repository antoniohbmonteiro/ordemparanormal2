export type SingleItemCatalogSource =
  | { readonly kind: "world"; readonly documentId: string }
  | {
      readonly kind: "compendium";
      readonly packId: string;
      readonly documentId: string;
    };

export interface SingleItemCatalogEntry {
  readonly key: string;
  readonly uuid: string;
  readonly name: string;
  readonly img: string;
  readonly origin: string;
  readonly source: SingleItemCatalogSource;
}

export interface SingleItemCatalogDefinition {
  readonly itemType: string;
  readonly worldLabelKey: string;
  readonly unavailableSourceMessage: string;
}

interface CompendiumIndexEntry {
  readonly _id: string;
  readonly uuid: string;
  readonly name: string;
  readonly img?: string;
  readonly type: string;
}

interface ItemCompendiumPack {
  readonly collection: string;
  readonly documentName: string;
  readonly title: string;
  readonly visible: boolean;
  getIndex(options: { readonly fields: string[] }): Promise<Iterable<unknown>>;
  getDocument(id: string): Promise<foundry.documents.Item | undefined>;
}

interface ItemCatalogGame {
  readonly items: Iterable<foundry.documents.Item> & {
    get(id: string): foundry.documents.Item | undefined;
  };
  readonly packs: Iterable<ItemCompendiumPack> & {
    get(id: string): ItemCompendiumPack | undefined;
  };
}

function isCompendiumIndexEntry(entry: unknown): entry is CompendiumIndexEntry {
  if (!entry || typeof entry !== "object") return false;
  const candidate = entry as Partial<CompendiumIndexEntry>;
  return (
    typeof candidate._id === "string" &&
    typeof candidate.uuid === "string" &&
    typeof candidate.name === "string" &&
    typeof candidate.type === "string" &&
    (candidate.img === undefined || typeof candidate.img === "string")
  );
}

function sortCatalog(
  entries: readonly SingleItemCatalogEntry[],
): readonly SingleItemCatalogEntry[] {
  return [...entries].sort(
    (left, right) =>
      left.origin.localeCompare(right.origin, "pt-BR") ||
      left.name.localeCompare(right.name, "pt-BR"),
  );
}

export async function loadAvailableSingleItems(
  definition: SingleItemCatalogDefinition,
): Promise<readonly SingleItemCatalogEntry[]> {
  const catalogGame = game as typeof game & ItemCatalogGame;
  const entries: SingleItemCatalogEntry[] = [];
  const worldLabel = game.i18n.localize(definition.worldLabelKey);

  for (const item of catalogGame.items) {
    if (item.type !== definition.itemType || !item.visible || !item.id) continue;
    entries.push({
      key: `world:${item.id}`,
      uuid: item.uuid,
      name: item.name,
      img: item.img ?? "icons/svg/item-bag.svg",
      origin: worldLabel,
      source: { kind: "world", documentId: item.id },
    });
  }

  for (const pack of catalogGame.packs) {
    if (pack.documentName !== "Item" || !pack.visible) continue;
    const index = await pack.getIndex({ fields: ["name", "img", "type"] });
    for (const rawEntry of index) {
      if (!isCompendiumIndexEntry(rawEntry)) continue;
      if (rawEntry.type !== definition.itemType) continue;
      entries.push({
        key: `compendium:${pack.collection}:${rawEntry._id}`,
        uuid: rawEntry.uuid,
        name: rawEntry.name,
        img: rawEntry.img ?? "icons/svg/item-bag.svg",
        origin: pack.title,
        source: {
          kind: "compendium",
          packId: pack.collection,
          documentId: rawEntry._id,
        },
      });
    }
  }
  return sortCatalog(entries);
}

export async function resolveSingleItemCatalogSource(
  source: SingleItemCatalogSource,
  definition: SingleItemCatalogDefinition,
): Promise<foundry.documents.Item> {
  const catalogGame = game as typeof game & ItemCatalogGame;
  const item =
    source.kind === "world"
      ? catalogGame.items.get(source.documentId)
      : await catalogGame.packs
          .get(source.packId)
          ?.getDocument(source.documentId);
  if (!item || item.type !== definition.itemType) {
    throw new Error(definition.unavailableSourceMessage);
  }
  return item;
}
