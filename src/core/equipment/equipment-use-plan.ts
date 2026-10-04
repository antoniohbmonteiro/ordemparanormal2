import { readEquipmentUseForms, resolveEquipmentUse, type EquipmentUseData } from "./equipment-use";
import { readEquipmentUses } from "./equipment-uses";

export type EquipmentUsePlan =
  | { readonly status: "ready"; readonly use: EquipmentUseData | null; readonly remaining: number | null }
  | { readonly status: "invalid" | "insufficient" };

export function planEquipmentUse(forms: unknown, resource: unknown, useFormId: string | null): EquipmentUsePlan {
  const uses = readEquipmentUseForms(forms);
  if (!uses) return { status: "invalid" };
  const use = useFormId === null ? null : resolveEquipmentUse(uses, useFormId);
  if (useFormId === null ? uses.length > 0 : !use) return { status: "invalid" };
  if (!use?.consumesUse) return { status: "ready", use, remaining: null };
  const counter = readEquipmentUses(resource);
  if (!counter) return { status: "invalid" };
  if (counter.value < 1) return { status: "insufficient" };
  return { status: "ready", use, remaining: counter.value - 1 };
}
