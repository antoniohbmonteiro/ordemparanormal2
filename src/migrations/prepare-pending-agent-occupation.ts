import { OCCUPATION_ITEM_TYPE } from "../config/system-config";
import { createLegacyOccupationSnapshot } from "../features/occupations/manage-agent-occupation";
import {
  createLegacyOccupationData,
  LEGACY_OCCUPATION_FLAG_PATH,
  readLegacyOccupationData,
} from "./legacy-occupation-data";

export interface PendingAgentSource {
  readonly system?: { readonly occupation?: unknown };
  readonly items?: readonly unknown[];
  readonly flags?: {
    readonly ordemparanormal2?: {
      readonly legacyOccupation?: unknown;
    };
  };
}

export type PendingOccupationPreparation =
  | { readonly status: "unchanged" }
  | {
      readonly status: "update";
      readonly update: Record<string, unknown>;
    }
  | {
      readonly status: "conflict";
      readonly occupation: string;
      readonly legacyFlag: string;
    };

function isPendingOccupation(item: unknown): boolean {
  return Boolean(
    item &&
      typeof item === "object" &&
      (item as { type?: unknown }).type === OCCUPATION_ITEM_TYPE,
  );
}

export function preparePendingAgentOccupation(
  source: PendingAgentSource,
): PendingOccupationPreparation {
  const occupation = source.system?.occupation;
  if (typeof occupation !== "string" || occupation.length === 0) {
    return { status: "unchanged" };
  }

  const items = source.items ?? [];
  if (!items.some(isPendingOccupation)) {
    return {
      status: "update",
      update: {
        "system.occupation": "",
        items: [...items, createLegacyOccupationSnapshot(occupation)],
      },
    };
  }

  const rawFlag = source.flags?.ordemparanormal2?.legacyOccupation;
  const legacyFlag = readLegacyOccupationData(rawFlag);
  if (rawFlag !== undefined && legacyFlag?.value !== occupation) {
    return {
      status: "conflict",
      occupation,
      legacyFlag: legacyFlag?.value ?? JSON.stringify(rawFlag),
    };
  }

  return {
    status: "update",
    update: {
      "system.occupation": "",
      ...(legacyFlag
        ? {}
        : { [LEGACY_OCCUPATION_FLAG_PATH]: createLegacyOccupationData(occupation) }),
    },
  };
}
