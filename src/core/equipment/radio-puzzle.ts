export interface RadioPuzzleConfig {
  readonly type: "radio";
  readonly sequenceLength?: never;
  readonly trueFragments: readonly string[];
  readonly falseFragments: readonly string[];
}
export interface RadioPiece { readonly id: string; readonly text: string }
export interface RadioPuzzleState {
  readonly active: readonly RadioPiece[];
  readonly discarded: readonly RadioPiece[];
}
export function isRadioPuzzleConfig(value: unknown): value is RadioPuzzleConfig {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const config = value as Record<string, unknown>;
  const texts = (list: unknown): list is string[] => Array.isArray(list)
    && list.every(text => typeof text === "string" && !!text.trim());
  return config.type === "radio" && config.sequenceLength === undefined
    && texts(config.trueFragments) && config.trueFragments.length > 0 && texts(config.falseFragments)
    && !config.falseFragments.some(text => (config.trueFragments as string[]).some(real => real.trim() === text.trim()));
}
export function radioRemovalCount(total: number, falseCount: number): number {
  if (!Number.isSafeInteger(total) || !Number.isSafeInteger(falseCount) || falseCount < 0)
    throw new Error("Invalid radio removal input.");
  return total <= 6 ? 0 : total <= 9 ? Math.min(2, falseCount) : total <= 12 ? Math.min(3, falseCount) : falseCount;
}
export function shuffleRadioValues<T>(values: readonly T[], random: () => number): T[] {
  const next = [...values];
  for (let i = next.length - 1; i > 0; i--) {
    const value = random();
    if (!Number.isFinite(value) || value < 0 || value >= 1) throw new Error("Invalid shuffle random value.");
    const j = Math.floor(value * (i + 1));
    [next[i], next[j]] = [next[j]!, next[i]!];
  }
  return next;
}
export function prepareRadioPuzzle(config: RadioPuzzleConfig, total: number, random: () => number, id: () => string) {
  if (!isRadioPuzzleConfig(config)) throw new Error("Invalid radio puzzle.");
  const removedCount = radioRemovalCount(total, config.falseFragments.length);
  const remaining = shuffleRadioValues(config.falseFragments, random).slice(removedCount);
  const active = shuffleRadioValues([...config.trueFragments, ...remaining].map(text => ({ id: id(), text: text.trim() })), random);
  if (new Set(active.map(piece => piece.id)).size !== active.length) throw new Error("Duplicate radio token.");
  return { removedCount, active, discarded: [] as RadioPiece[] };
}
export function changeRadioPuzzle(state: RadioPuzzleState, action: "move" | "discard" | "restore", id: string,
  direction?: -1 | 1): RadioPuzzleState {
  const active = [...state.active], discarded = [...state.discarded];
  const source = action === "restore" ? discarded : active;
  const index = source.findIndex(piece => piece.id === id);
  if (index < 0) throw new Error("Unknown radio token.");
  if (action === "move") {
    if (direction !== -1 && direction !== 1 || index + direction < 0 || index + direction >= active.length)
      throw new Error("Invalid radio move.");
    [active[index], active[index + direction]] = [active[index + direction]!, active[index]!];
  } else {
    const [piece] = source.splice(index, 1);
    (action === "restore" ? active : discarded).push(piece!);
  }
  return { active, discarded };
}
export function radioPuzzleSucceeded(config: RadioPuzzleConfig, state: RadioPuzzleState): boolean {
  return state.active.length === config.trueFragments.length
    && state.active.every((piece, i) => piece.text === config.trueFragments[i]!.trim());
}
