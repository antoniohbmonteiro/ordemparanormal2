import { SYSTEM_ID } from "../../../config/system-config";
import { planEquipmentUse } from "../../../core/equipment/equipment-use-plan";
import type { EquipmentMechanic, EquipmentUseData } from "../../../core/equipment/equipment-use";
import { publishEquipmentMessage } from "../chat/publish-equipment-message";
import { enqueueEquipmentOperation } from "./equipment-operation-queue";
import { equipmentSourceUuid } from "./equipment-source";

export interface EquipmentUseIntent {
  readonly actorUuid: string;
  readonly equipmentId: string;
  readonly useFormId: string | null;
  readonly operationId: string;
}
export type EquipmentUseResult =
  | { readonly status: "success"; readonly newCount: number; readonly manual: boolean }
  | { readonly status: "invalid" | "forbidden" | "insufficient" | "uncertain" | "contextRequired" | "gmRequired" | "busy" | "cancelled" }
  | { readonly status: "partial"; readonly stage: "publication" | "discovery" | "analysis" };
export interface ResolvedEquipmentUse {
  readonly actor: foundry.documents.Actor;
  readonly equipment: foundry.documents.Item;
  readonly use: EquipmentUseData | null;
  readonly sourceUuid: string | null;
  readonly isTool: boolean;
}
export type EquipmentPostUse = (resolved: ResolvedEquipmentUse) => Promise<{ newCount: number; manual: boolean }>;
interface Operation {
  readonly binding: string;
  resolved?: ResolvedEquipmentUse;
  published: boolean;
  result?: EquipmentUseResult;
}
const operations = new Map<string, Operation>();
export interface EquipmentExecutionOptions {
  readonly expectedMechanic: EquipmentMechanic;
  readonly beforePayment: (resolved: ResolvedEquipmentUse) => Promise<EquipmentUseResult | null>;
  readonly postUseFailureStage?: "analysis" | "discovery";
  readonly onExecuted?: (resolved: ResolvedEquipmentUse) => void;
}
let sessionGuard: ((input: EquipmentUseIntent, requester: foundry.documents.User) => EquipmentUseResult | null) | undefined;
export function registerEquipmentSessionGuard(guard: NonNullable<typeof sessionGuard>): void { sessionGuard = guard; }

export function ownedEquipmentForUser(input: Pick<EquipmentUseIntent, "actorUuid" | "equipmentId">,
  user: foundry.documents.User): ResolvedEquipmentUse | null {
  const actor = /^Actor\.[^.]+$/u.test(input.actorUuid) ? game.actors.get(input.actorUuid.slice(6)) : null;
  if (!actor || actor.uuid !== input.actorUuid || actor.type !== "agent"
    || !user.isGM && !actor.testUserPermission(user, CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER)) return null;
  const equipment = actor.getEmbeddedDocument("Item", input.equipmentId) as foundry.documents.Item | null;
  if (equipment?.type !== "equipment" || equipment.actor !== actor) return null;
  return { actor, equipment, use: null, sourceUuid: equipmentSourceUuid(equipment),
    isTool: (equipment.system as { category?: unknown }).category === "tool" };
}

export function isEquipmentUseIntent(value: unknown): value is EquipmentUseIntent {
  if (!value || typeof value !== "object") return false;
  const input = value as EquipmentUseIntent;
  return typeof input.actorUuid === "string" && typeof input.equipmentId === "string" && !!input.equipmentId
    && typeof input.operationId === "string" && input.operationId.length > 0 && input.operationId.length <= 100
    && (input.useFormId === null || typeof input.useFormId === "string" && !!input.useFormId);
}

/** The binding is an opaque caller context: this executor does not interpret POI state. */
export async function executeEquipmentUse(input: EquipmentUseIntent, requester: foundry.documents.User,
  binding = "", postUse?: EquipmentPostUse, options?: EquipmentExecutionOptions): Promise<EquipmentUseResult> {
  if (!isEquipmentUseIntent(input)) return { status: "invalid" };
  return enqueueEquipmentOperation(input.actorUuid, input.equipmentId, async () => {
    const owned = ownedEquipmentForUser(input, requester);
    if (!owned) return { status: "forbidden" };
    const guarded = sessionGuard?.(input, requester);
    if (guarded) return guarded;
    const key = `${requester.id}:${input.operationId}`;
    const fingerprint = JSON.stringify([input.actorUuid, input.equipmentId, input.useFormId, binding]);
    let operation = operations.get(key);
    if (operation && operation.binding !== fingerprint) return { status: "invalid" };
    if (operation?.result) return operation.result;
    if (!operation) {
      operation = { binding: fingerprint, published: false };
      operations.set(key, operation);
    }
    if (!operation.resolved) {
      const system = owned.equipment.system as { useForms?: unknown; uses?: unknown };
      const plan = planEquipmentUse(system.useForms, system.uses, input.useFormId);
      if (plan.status !== "ready") return { status: plan.status };
      if ((plan.use?.mechanic ?? "standard") !== (options?.expectedMechanic ?? "standard"))
        return { status: "contextRequired" };
      const rejected = await options?.beforePayment({ ...owned, use: plan.use });
      if (rejected) return rejected;
      // A rejected transport may follow a committed update. Never repeat an ambiguous payment automatically.
      if (plan.remaining !== null) {
        try { await owned.equipment.update({ "system.uses.value": plan.remaining }); }
        catch { operation.result = { status: "uncertain" }; return operation.result; }
      }
      operation.resolved = { ...owned, use: plan.use };
      options?.onExecuted?.(operation.resolved);
    }
    if (!operation.published) {
      try {
        await publishEquipmentMessage(operation.resolved.actor, operation.resolved.equipment, operation.resolved.use,
          `${requester.id}:${input.operationId}`);
        operation.published = true;
      } catch { return { status: "partial", stage: "publication" }; }
    }
    try {
      const contextual = postUse ? await postUse(operation.resolved) : { newCount: 0, manual: false };
      operation.result = { status: "success", ...contextual };
      return operation.result;
    } catch { return { status: "partial", stage: options?.postUseFailureStage ?? "discovery" }; }
  });
}

export const EQUIPMENT_USE_QUERY = `${SYSTEM_ID}.useEquipment`;
export function activeEquipmentAuthority(requester: foundry.documents.User): boolean {
  const users = game.users as unknown as { get(id: string): foundry.documents.User | undefined };
  return !!game.user?.isGM && game.users.activeGM?.id === game.user.id && users.get(requester.id) === requester;
}
export function registerEquipmentUseQuery(): void {
  (CONFIG as typeof CONFIG & { queries: Record<string, unknown> }).queries[EQUIPMENT_USE_QUERY] =
    (input: EquipmentUseIntent, context: { user: foundry.documents.User }) => activeEquipmentAuthority(context.user)
      ? executeEquipmentUse(input, context.user) : { status: "forbidden" };
}
