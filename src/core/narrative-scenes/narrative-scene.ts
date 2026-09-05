export interface NarrativeScene {
  id: string;
  name: string;
}

export function createNarrativeScene(
  id: string,
  name: string,
): NarrativeScene {
  if (typeof id !== "string" || id.trim().length === 0) {
    throw new TypeError("Narrative Scene id must be a non-empty string.");
  }

  if (typeof name !== "string" || name.trim().length === 0) {
    throw new TypeError("Narrative Scene name must be a non-empty string.");
  }

  return { id, name: name.trim() };
}

export function isNarrativeScene(value: unknown): value is NarrativeScene {
  if (typeof value !== "object" || value === null) return false;

  const candidate = value as Partial<NarrativeScene>;
  return (
    typeof candidate.id === "string" &&
    candidate.id.trim().length > 0 &&
    typeof candidate.name === "string" &&
    candidate.name.trim().length > 0
  );
}
