import { readEquipmentUseForms } from "../../core/equipment/equipment-use";
import { selectEquipmentUse } from "../../applications/equipment/equipment-use-dialog";
import { EQUIPMENT_USE_QUERY, executeEquipmentUse, type EquipmentUseIntent,
  type EquipmentUseResult } from "../../adapters/foundry/equipment/execute-equipment-use";

export type EquipmentUseDispatch = (input: EquipmentUseIntent) => Promise<EquipmentUseResult>;
interface PendingUse { readonly intent: EquipmentUseIntent; readonly authorityId: string | null; readonly binding: string }
const pending = new Map<string, PendingUse>();
const inFlight = new Set<string>();
const listeners = new Set<(actorUuid: string, equipmentId: string) => void>();
export function subscribeEquipmentUse(listener: (actorUuid: string, equipmentId: string) => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
export function isEquipmentUseInFlight(actorUuid: string, equipmentId: string): boolean {
  return inFlight.has(`${actorUuid}:${equipmentId}`);
}
function notify(actorUuid: string, equipmentId: string): void {
  for (const listener of listeners) {
    try { listener(actorUuid, equipmentId); }
    catch (error) { console.warn("ordemparanormal2 | Equipment use presentation refresh failed", error); }
  }
}

export async function dispatchEquipmentUse(input: EquipmentUseIntent): Promise<EquipmentUseResult> {
  const gm = game.users.activeGM;
  if (!gm) return executeEquipmentUse(input, game.user);
  if (gm.id === game.user.id) return executeEquipmentUse(input, game.user);
  return await gm.query(EQUIPMENT_USE_QUERY, input, { timeout: 10000 }) as EquipmentUseResult;
}

/** Selection and retries are shared by Inventory and contextual consumers, independently of their markup. */
export async function useEquipment(actor: foundry.documents.Actor, equipmentId: string,
  dispatch: EquipmentUseDispatch = dispatchEquipmentUse, binding = ""): Promise<EquipmentUseResult | { status: "cancelled" | "busy" }> {
  const key = `${actor.uuid}:${equipmentId}`;
  if (inFlight.has(key)) return { status: "busy" };
  if (!actor.isOwner && !game.user.isGM) return { status: "forbidden" };
  inFlight.add(key);
  notify(actor.uuid, equipmentId);
  try {
    const equipment = actor.getEmbeddedDocument("Item", equipmentId) as foundry.documents.Item | null;
    if (equipment?.type !== "equipment") return { status: "invalid" };
    let operation = pending.get(key);
    if (operation && (operation.authorityId !== (game.users.activeGM?.id ?? null) || operation.binding !== binding)) {
      return { status: "uncertain" };
    }
    if (!operation) {
      const forms = readEquipmentUseForms((equipment.system as { useForms?: unknown }).useForms);
      if (!forms) return { status: "invalid" };
      const useFormId = forms.length > 1 ? await selectEquipmentUse(equipment, forms) : forms[0]?.id ?? null;
      if (forms.length > 1 && useFormId === null) return { status: "cancelled" };
      operation = { intent: { actorUuid: actor.uuid, equipmentId, useFormId, operationId: crypto.randomUUID() },
        authorityId: game.users.activeGM?.id ?? null, binding };
      pending.set(key, operation);
    }
    let result: EquipmentUseResult;
    try { result = await dispatch(operation.intent); }
    catch { return { status: "uncertain" }; }
    if (result.status !== "partial" && result.status !== "uncertain") pending.delete(key);
    return result;
  } finally { inFlight.delete(key); notify(actor.uuid, equipmentId); }
}

export function equipmentUseFeedback(result: Awaited<ReturnType<typeof useEquipment>>): string | null {
  if (result.status === "busy" || result.status === "cancelled") return null;
  const root = "ORDEMPARANORMAL2.EquipmentUse";
  if (result.status === "success") return result.newCount
    ? game.i18n.format(`${root}.Discovered`, { count: result.newCount })
    : game.i18n.localize(`${root}.${result.manual ? "Manual" : "Completed"}`);
  return game.i18n.localize(`${root}.${result.status === "partial"
    ? result.stage === "publication" ? "PublicationFailed" : "DiscoveryFailed" : result.status}`);
}
