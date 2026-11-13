import { ABILITY_ITEM_TYPE, SYSTEM_ID } from "../../../config/system-config";

export const LEGACY_THREAT_ENTRY_FLAG = "legacyThreatEntry";
export const LEGACY_THREAT_SECTIONS = ["actions", "passiveEffects", "specialAbilities"] as const;
export type LegacyThreatSection = (typeof LEGACY_THREAT_SECTIONS)[number];
export const LEGACY_THREAT_PATHS: Record<LegacyThreatSection, string> = {
  actions: "system.actions",
  passiveEffects: "system.characteristics.passiveEffects",
  specialAbilities: "system.characteristics.specialAbilities",
};

export interface LegacyThreatEntryFlag {
  readonly section: LegacyThreatSection;
  readonly id: string;
  readonly owner: string;
  readonly source: string;
}

export function readLegacyThreatEntry(item: Pick<foundry.documents.Item, "type" | "getFlag">): LegacyThreatEntryFlag | undefined {
  if (item.type !== ABILITY_ITEM_TYPE) return;
  const flag = item.getFlag(SYSTEM_ID, LEGACY_THREAT_ENTRY_FLAG) as Partial<LegacyThreatEntryFlag> | undefined;
  if (!flag || !LEGACY_THREAT_SECTIONS.some((section) => section === flag.section)
    || typeof flag.id !== "string" || typeof flag.owner !== "string" || typeof flag.source !== "string") return;
  return flag as LegacyThreatEntryFlag;
}

export function hasLegacyThreatOverride(token: foundry.documents.TokenDocument, section: LegacyThreatSection): boolean {
  const parent = LEGACY_THREAT_PATHS[section].split(".").slice(0, -1).join(".");
  const source = foundry.utils.getProperty(token.delta?.toObject() ?? {}, parent);
  return !!source && typeof source === "object" && Object.hasOwn(source, section);
}
