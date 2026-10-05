import { EQUIPMENT_ITEM_TYPE, SYSTEM_ID } from "../../../config/system-config";
import { enqueueEquipmentOperation } from "./equipment-operation-queue";
import { activeEquipmentAuthority, ownedEquipmentForUser } from "./execute-equipment-use";
import {
  adjustEquipmentUsesValue,
  readEquipmentUses,
  type EquipmentUsesAdjustment,
} from "../../../core/equipment/equipment-uses";

export type OwnedEquipmentUsesAdjustmentResult =
  | { readonly status: "updated"; readonly value: number }
  | { readonly status: "unchanged"; readonly value: number }
  | { readonly status: "invalid" };

export async function adjustOwnedEquipmentUses(
  actor: foundry.documents.Actor,
  equipmentId: string,
  adjustment: EquipmentUsesAdjustment,
): Promise<OwnedEquipmentUsesAdjustmentResult> {
  if (!actor.isOwner && !game.user.isGM) return { status: "invalid" };
  const gm = game.users.activeGM;
  if (gm && gm.id !== game.user.id) return await gm.query(ADJUST_QUERY,
    { actorUuid: actor.uuid, equipmentId, adjustment }, { timeout: 10000 }) as OwnedEquipmentUsesAdjustmentResult;
  return enqueueEquipmentOperation(actor.uuid, equipmentId, () => !actor.isOwner && !game.user.isGM
    ? Promise.resolve({ status: "invalid" }) : adjustUses(actor, equipmentId, adjustment));
}

async function adjustUses(actor: foundry.documents.Actor, equipmentId: string,
  adjustment: EquipmentUsesAdjustment): Promise<OwnedEquipmentUsesAdjustmentResult> {
  if (adjustment !== -1 && adjustment !== 1) return { status: "invalid" };
  const equipment = actor.getEmbeddedDocument(
    "Item",
    equipmentId,
  ) as foundry.documents.Item | null;
  if (equipment?.type !== EQUIPMENT_ITEM_TYPE) return { status: "invalid" };

  const uses = readEquipmentUses(
    (equipment.system as unknown as { readonly uses?: unknown }).uses,
  );
  if (!uses) return { status: "invalid" };

  const adjusted = adjustEquipmentUsesValue(uses, adjustment);
  if (adjusted.value === uses.value) {
    return { status: "unchanged", value: uses.value };
  }

  await equipment.update({ "system.uses.value": adjusted.value });
  return { status: "updated", value: adjusted.value };
}

const ADJUST_QUERY = `${SYSTEM_ID}.adjustEquipmentUses`;
export function registerEquipmentUsesAdjustmentQuery(): void {
  (CONFIG as typeof CONFIG & { queries: Record<string, unknown> }).queries[ADJUST_QUERY] =
    (input: { actorUuid: string; equipmentId: string; adjustment: EquipmentUsesAdjustment }, context: { user: foundry.documents.User }) => {
      if (!activeEquipmentAuthority(context.user) || !input || typeof input.actorUuid !== "string"
        || typeof input.equipmentId !== "string" || ![-1, 1].includes(input.adjustment)) return { status: "invalid" };
      return enqueueEquipmentOperation(input.actorUuid, input.equipmentId, () => {
        const owned = ownedEquipmentForUser(input, context.user);
        return owned ? adjustUses(owned.actor, input.equipmentId, input.adjustment) : Promise.resolve({ status: "invalid" });
      });
    };
}
