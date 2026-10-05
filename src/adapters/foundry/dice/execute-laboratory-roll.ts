import type { LaboratoryDie } from "../../../core/equipment/laboratory-challenge";

export interface LaboratoryRoll {
  readonly value: number;
  readonly serialized: ReturnType<Roll["toJSON"]>;
}
/** Independent rolls: no Check totals, criticals or contributing-dice rules. */
export async function executeLaboratoryRoll(die: LaboratoryDie): Promise<LaboratoryRoll> {
  const roll = Roll.create(`1d${die}`);
  await roll.evaluate({ allowInteractive: false });
  const values = roll.dice[0]?.results.filter(result => result.active !== false && !result.discarded);
  if (roll.dice.length !== 1 || roll.dice[0]?.faces !== die || values?.length !== 1)
    throw new Error("Laboratory requires one independent die result.");
  const value = values[0]?.result;
  if (!Number.isInteger(value) || value! < 1 || value! > die) throw new Error("Invalid laboratory roll result.");
  return { value: value!, serialized: roll.toJSON() };
}
