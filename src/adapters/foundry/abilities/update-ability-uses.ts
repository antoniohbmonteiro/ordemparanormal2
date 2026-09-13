import {
  appendAbilityUse,
  createAbilityUsePatch,
  patchAbilityUse,
  readAbilityUse,
  readAbilityUses,
  removeAbilityUse,
  reorderAbilityUse,
  type AbilityUseData,
  type AbilityUseMoveDirection,
} from "../../../core/abilities/ability-use";
import { readAbilityResource } from "../../../core/abilities/ability-resource";

export type AbilityUseMutationResult =
  | { readonly status: "updated"; readonly uses: readonly AbilityUseData[] }
  | { readonly status: "unchanged"; readonly uses: readonly AbilityUseData[] }
  | { readonly status: "stale" }
  | { readonly status: "invalid-collection" }
  | { readonly status: "invalid-use" }
  | { readonly status: "duplicate-id" };

const abilityQueues = new WeakMap<object, Promise<void>>();

function readCurrentUses(ability: foundry.documents.Item): readonly AbilityUseData[] | null {
  const system = ability.system as unknown as { readonly uses?: unknown };
  const uses = readAbilityUses(system.uses);
  if (!uses) return null;
  const resource = readAbilityResource(
    (ability.system as unknown as { readonly resource?: unknown }).resource,
  );
  return uses.some(({ cost }) => cost.source === "resource") && !resource
    ? null
    : uses;
}

function readValidDraft(
  ability: foundry.documents.Item,
  draft: AbilityUseData,
): AbilityUseData | null {
  const valid = readAbilityUse(draft);
  if (!valid) return null;
  if (
    valid.cost.source === "resource" &&
    !readAbilityResource(
      (ability.system as unknown as { readonly resource?: unknown }).resource,
    )
  ) return null;
  return valid;
}

export function enqueueAbilityMutation<T>(
  ability: foundry.documents.Item,
  operation: () => Promise<T>,
): Promise<T> {
  const previous = abilityQueues.get(ability) ?? Promise.resolve();
  const result = previous.then(operation, operation);
  abilityQueues.set(ability, result.then(() => undefined, () => undefined));
  return result;
}

async function persist(
  ability: foundry.documents.Item,
  uses: readonly AbilityUseData[],
): Promise<AbilityUseMutationResult> {
  await ability.update({ "system.uses": uses });
  return { status: "updated", uses };
}

export function saveNewAbilityUse(
  ability: foundry.documents.Item,
  draft: AbilityUseData,
): Promise<AbilityUseMutationResult> {
  return enqueueAbilityMutation(ability, async () => {
    const current = readCurrentUses(ability);
    if (!current) return { status: "invalid-collection" };
    const validDraft = readValidDraft(ability, draft);
    if (!validDraft) return { status: "invalid-use" };
    const next = appendAbilityUse(current, validDraft);
    return next ? persist(ability, next) : { status: "duplicate-id" };
  });
}

export function saveExistingAbilityUse(
  ability: foundry.documents.Item,
  baseline: AbilityUseData,
  draft: AbilityUseData,
): Promise<AbilityUseMutationResult> {
  return enqueueAbilityMutation(ability, async () => {
    const current = readCurrentUses(ability);
    if (!current) return { status: "invalid-collection" };
    const validDraft = readValidDraft(ability, draft);
    if (!validDraft) return { status: "invalid-use" };
    const patch = createAbilityUsePatch(baseline, validDraft);
    if (!Object.keys(patch).length) return { status: "unchanged", uses: current };
    const next = patchAbilityUse(current, baseline.id, patch);
    return next ? persist(ability, next) : { status: "stale" };
  });
}

export function deleteAbilityUse(
  ability: foundry.documents.Item,
  id: string,
): Promise<AbilityUseMutationResult> {
  return enqueueAbilityMutation(ability, async () => {
    const current = readCurrentUses(ability);
    if (!current) return { status: "invalid-collection" };
    const next = removeAbilityUse(current, id);
    return next ? persist(ability, next) : { status: "stale" };
  });
}

export function moveAbilityUse(
  ability: foundry.documents.Item,
  id: string,
  direction: AbilityUseMoveDirection,
): Promise<AbilityUseMutationResult> {
  return enqueueAbilityMutation(ability, async () => {
    const current = readCurrentUses(ability);
    if (!current) return { status: "invalid-collection" };
    const next = reorderAbilityUse(current, id, direction);
    if (!next) return { status: "stale" };
    if (next === current) return { status: "unchanged", uses: current };
    return persist(ability, next);
  });
}
