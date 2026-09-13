import { ABILITY_ITEM_TYPE } from "../../../config/system-config";
import { readAbilityResource, type AbilityResourceData } from "../../../core/abilities/ability-resource";
import { readAbilityUses, type AbilityUseData } from "../../../core/abilities/ability-use";

export type AbilityUsesView =
  | { readonly kind: "valid"; readonly isValid: true; readonly uses: readonly AbilityUseData[]; readonly count: number; readonly isEmpty: boolean; readonly isSingle: boolean; readonly isMultiple: boolean }
  | { readonly kind: "invalid"; readonly isInvalid: true; readonly uses: readonly []; readonly count: 0 };

export interface OwnedAbilityView {
  readonly id: string;
  readonly name: string;
  readonly img: string;
  readonly description: string;
  readonly useCollection: AbilityUsesView;
  readonly useSummary: {
    readonly isEmpty: boolean;
    readonly isSingleNone: boolean;
    readonly isSingleDetermination: boolean;
    readonly isSingleResource: boolean;
    readonly isMultiple: boolean;
    readonly isInvalid: boolean;
    readonly amount: number;
    readonly count: number;
  };
  readonly resource: AbilityResourceData | null;
}

function readDescription(system: unknown): string {
  if (!system || typeof system !== "object") return "";
  const description = (system as { readonly description?: unknown }).description;
  return typeof description === "string" ? description : "";
}

function createUsesView(system: unknown): AbilityUsesView {
  if (!system || typeof system !== "object") return { kind: "invalid", isInvalid: true, uses: [], count: 0 };
  const abilitySystem = system as { readonly uses?: unknown; readonly resource?: unknown };
  const uses = readAbilityUses(abilitySystem.uses);
  if (
    !uses ||
    (uses.some(({ cost }) => cost.source === "resource") && !readAbilityResource(abilitySystem.resource))
  ) return { kind: "invalid", isInvalid: true, uses: [], count: 0 };
  return {
    kind: "valid", isValid: true, uses, count: uses.length,
    isEmpty: uses.length === 0, isSingle: uses.length === 1, isMultiple: uses.length > 1,
  };
}

function createUseSummary(collection: AbilityUsesView): OwnedAbilityView["useSummary"] {
  const single = collection.kind === "valid" && collection.count === 1 ? collection.uses[0] : undefined;
  return {
    isEmpty: collection.kind === "valid" && collection.count === 0,
    isSingleNone: single?.cost.source === "none",
    isSingleDetermination: single?.cost.source === "determination",
    isSingleResource: single?.cost.source === "resource",
    isMultiple: collection.kind === "valid" && collection.count > 1,
    isInvalid: collection.kind === "invalid",
    amount: single?.cost.amount ?? 0,
    count: collection.count,
  };
}

export function collectOwnedAbilities(items: Iterable<foundry.documents.Item>): readonly OwnedAbilityView[] {
  return [...items]
    .filter((item): item is foundry.documents.Item & { readonly id: string } => item.type === ABILITY_ITEM_TYPE && typeof item.id === "string")
    .sort((left, right) => left.sort - right.sort)
    .map((item) => {
      const useCollection = createUsesView(item.system);
      return {
        id: item.id,
        name: item.name,
        img: item.img ?? "icons/svg/item-bag.svg",
        description: readDescription(item.system),
        useCollection,
        useSummary: createUseSummary(useCollection),
        resource: readAbilityResource((item.system as unknown as { readonly resource?: unknown }).resource),
      };
    });
}
