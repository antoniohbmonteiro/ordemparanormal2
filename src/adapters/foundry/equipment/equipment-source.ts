import { isEquipmentSourceUuid, type LaboratoryMechanicConfig } from "../../../documents/item/point-of-interest-data";
import { readEquipmentUseForms, type EquipmentMechanic } from "../../../core/equipment/equipment-use";
import { loadAvailableSingleItems, resolveSingleItemCatalogSource } from "../items/single-item-catalog";

export function equipmentSourceUuid(item: foundry.documents.Item): string | null {
  if (item.type !== "equipment") return null;
  const stats = item._stats;
  if (item.inCompendium && isEquipmentSourceUuid(item.uuid)) return item.uuid;
  if (isEquipmentSourceUuid(stats?.compendiumSource) && stats.compendiumSource.startsWith("Compendium."))
    return stats.compendiumSource;
  if (!item.isEmbedded && isEquipmentSourceUuid(item.uuid)) return item.uuid;
  return isEquipmentSourceUuid(stats?.duplicateSource) && stats.duplicateSource.startsWith("Item.")
    ? stats.duplicateSource : null;
}

const definition = { itemType: "equipment", worldLabelKey: "ORDEMPARANORMAL2.EquipmentUse.World",
  unavailableSourceMessage: "A fonte do equipamento não está disponível." };
export interface ToolSourceChoice {
  readonly uuid: string;
  readonly name: string;
  readonly origin: string;
  readonly forms: readonly { readonly id: string; readonly name: string; readonly mechanic: EquipmentMechanic }[];
}
export async function loadToolSources(): Promise<readonly ToolSourceChoice[]> {
  if (!game.user?.isGM) return [];
  const entries = await loadAvailableSingleItems(definition);
  const result: ToolSourceChoice[] = [];
  for (const entry of entries) {
    try {
      const item = await resolveSingleItemCatalogSource(entry.source, definition);
      const system = item.system as { category?: unknown; useForms?: unknown };
      const uuid = equipmentSourceUuid(item);
      const forms = readEquipmentUseForms(system.useForms);
      if (system.category !== "tool" || !uuid || !forms?.length || result.some(choice => choice.uuid === uuid)) continue;
      result.push({ uuid, name: item.name, origin: entry.origin, forms: forms.map(({ id, name, mechanic }) => ({ id, name, mechanic })) });
    } catch { /* An inaccessible source must not prevent editing other approaches. */ }
  }
  return result;
}

export async function describeToolApproach(equipmentUuid: string, useFormId: string, config?: LaboratoryMechanicConfig) {
  try {
    const item = await fromUuid(equipmentUuid) as foundry.documents.Item | null;
    const system = item?.system as { category?: unknown; useForms?: unknown } | undefined;
    const form = readEquipmentUseForms(system?.useForms)?.find(use => use.id === useFormId);
    return { equipmentUuid, useFormId, equipmentName: item?.name ?? equipmentUuid,
      useFormName: form?.name ?? useFormId, ...(config ? { mechanicConfig: { ...config } } : {}),
      valid: item?.type === "equipment" && system?.category === "tool" && !!form
        && (form.mechanic === "laboratory" ? !!config : !config) };
  } catch { return { equipmentUuid, useFormId, equipmentName: equipmentUuid, useFormName: useFormId, valid: false }; }
}
