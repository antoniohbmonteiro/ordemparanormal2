export interface EquipmentUseData {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly consumesUse: boolean;
}

export type EquipmentUsePatch = Partial<Pick<EquipmentUseData,
  "name" | "description" | "consumesUse"
>>;

export function readEquipmentUse(value: unknown): EquipmentUseData | null {
  if (!value || typeof value !== "object") return null;
  const use = value as Partial<EquipmentUseData>;
  const id = typeof use.id === "string" ? use.id.trim() : "";
  const name = typeof use.name === "string" ? use.name.trim() : "";
  if (!id || !name || typeof use.description !== "string" ||
    typeof use.consumesUse !== "boolean") return null;
  return { id, name, description: use.description, consumesUse: use.consumesUse };
}

export function readEquipmentUseForms(value: unknown): readonly EquipmentUseData[] | null {
  if (!Array.isArray(value)) return null;
  const uses: EquipmentUseData[] = [];
  for (const entry of value) {
    const use = readEquipmentUse(entry);
    if (!use) return null;
    uses.push(use);
  }
  return new Set(uses.map(({ id }) => id)).size === uses.length ? uses : null;
}

export function resolveEquipmentUse(
  uses: readonly EquipmentUseData[], id: string,
): EquipmentUseData | null {
  return uses.find(use => use.id === id) ?? null;
}

export function appendEquipmentUse(
  uses: readonly EquipmentUseData[], use: EquipmentUseData,
): readonly EquipmentUseData[] | null {
  return readEquipmentUseForms([...uses, use]);
}

export function patchEquipmentUse(
  uses: readonly EquipmentUseData[], id: string, patch: EquipmentUsePatch,
): readonly EquipmentUseData[] | null {
  const index = uses.findIndex(use => use.id === id);
  if (index < 0) return null;
  const candidate = readEquipmentUse({ ...uses[index], ...patch, id });
  if (!candidate) return null;
  return readEquipmentUseForms(uses.map((use, i) => i === index ? candidate : use));
}

export function removeEquipmentUse(
  uses: readonly EquipmentUseData[], id: string,
): readonly EquipmentUseData[] | null {
  if (!resolveEquipmentUse(uses, id)) return null;
  return uses.filter(use => use.id !== id);
}
