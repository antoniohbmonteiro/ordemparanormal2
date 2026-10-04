import { SYSTEM_ID } from "../../../config/system-config";
import { EMPTY_EQUIPMENT_USES, readEquipmentUses } from "../../../core/equipment/equipment-uses";
import { enqueueEquipmentOperation } from "./equipment-operation-queue";
import { activeEquipmentAuthority, ownedEquipmentForUser } from "./execute-equipment-use";

export type EquipmentUsesMutation =
  | { readonly kind: "set"; readonly field: "value" | "max"; readonly value: number }
  | { readonly kind: "add" | "remove" };
interface EquipmentUsesIntent {
  readonly actorUuid: string;
  readonly equipmentId: string;
  readonly mutation: EquipmentUsesMutation;
}
const QUERY = `${SYSTEM_ID}.changeEquipmentUses`;
function validMutation(value: unknown): value is EquipmentUsesMutation {
  if (!value || typeof value !== "object") return false;
  const mutation = value as EquipmentUsesMutation;
  return mutation.kind === "add" || mutation.kind === "remove" || mutation.kind === "set"
    && ["value", "max"].includes(mutation.field) && Number.isInteger(mutation.value) && mutation.value >= 0;
}
async function writeMutation(input: EquipmentUsesIntent, requester: foundry.documents.User): Promise<boolean> {
  if (!input || typeof input.actorUuid !== "string" || typeof input.equipmentId !== "string"
    || !validMutation(input.mutation)) return false;
  return enqueueEquipmentOperation(input.actorUuid, input.equipmentId, async () => {
    const owned = ownedEquipmentForUser(input, requester);
    if (!owned) return false;
    const item = owned.equipment;
    const current = readEquipmentUses((item.system as { uses?: unknown }).uses);
    const mutation = input.mutation;
    if (mutation.kind === "set") {
      if (!current) return false;
      await item.update({ [`system.uses.${mutation.field}`]: mutation.value });
    } else if (mutation.kind === "add") {
      if (!current) await item.update({ "system.uses": { ...EMPTY_EQUIPMENT_USES } });
    } else if (current) await item.update({ "system.uses": null });
    return true;
  });
}
export async function mutateOwnedEquipmentUses(actor: foundry.documents.Actor, equipmentId: string,
  mutation: EquipmentUsesMutation): Promise<boolean> {
  if (!actor.isOwner && !game.user.isGM) return false;
  const input = { actorUuid: actor.uuid, equipmentId, mutation };
  const gm = game.users.activeGM;
  return gm && gm.id !== game.user.id ? await gm.query(QUERY, input, { timeout: 10000 }) as boolean
    : writeMutation(input, game.user);
}
export function registerEquipmentUsesMutationQuery(): void {
  (CONFIG as typeof CONFIG & { queries: Record<string, unknown> }).queries[QUERY] =
    (input: EquipmentUsesIntent, context: { user: foundry.documents.User }) => activeEquipmentAuthority(context.user)
      ? writeMutation(input, context.user) : false;
}
