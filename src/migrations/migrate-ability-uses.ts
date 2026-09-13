import { ABILITY_ITEM_TYPE } from "../config/system-config";
import { readAbilityCost } from "../core/abilities/ability-cost";
import { readAbilityResource } from "../core/abilities/ability-resource";
import { readAbilityUses, type AbilityUseData } from "../core/abilities/ability-use";

interface LegacyAbilitySystem {
  readonly cost?: unknown;
  readonly resource?: unknown;
  readonly uses?: unknown;
}

export function migrateLegacyAbilitySystem(
  system: LegacyAbilitySystem,
): readonly AbilityUseData[] {
  if (Object.hasOwn(system, "uses")) return readAbilityUses(system.uses) ?? [];

  const cost = readAbilityCost(system.cost);
  if (!cost || cost.source === "none" || cost.amount <= 0) return [];
  if (cost.source === "resource" && !readAbilityResource(system.resource)) return [];
  return [{
    id: "legacy-use",
    name: "Forma de uso legada",
    description: "",
    cost,
    minimumLevel: null,
  }];
}

function readPersistedSystem(item: foundry.documents.Item): LegacyAbilitySystem {
  const source = item.toObject(false) as unknown as { readonly system?: unknown };
  return source.system && typeof source.system === "object"
    ? source.system as LegacyAbilitySystem
    : {};
}

export async function migratePersistedAbilityUses(
  item: foundry.documents.Item,
): Promise<void> {
  if (item.type !== ABILITY_ITEM_TYPE) return;
  const system = readPersistedSystem(item);
  await item.update({
    "system.uses": migrateLegacyAbilitySystem(system),
    "system.-=cost": null,
  });
}

export async function migrateAbilityUses(
  worldItems: Iterable<foundry.documents.Item>,
  actors: Iterable<foundry.documents.Actor>,
): Promise<void> {
  for (const item of worldItems) await migratePersistedAbilityUses(item);
  for (const actor of actors) {
    const items = actor.getEmbeddedCollection("Item") as Iterable<foundry.documents.Item>;
    for (const item of items) await migratePersistedAbilityUses(item);
  }
}
