import {
  AGENT_ACTOR_TYPE,
  OCCUPATION_ITEM_TYPE,
} from "../../config/system-config";

export const OCCUPATION_FALLBACK_IMAGE = "icons/svg/item-bag.svg" as const;

export interface OccupationItemSnapshot {
  readonly name: string;
  readonly img: string;
  readonly type: typeof OCCUPATION_ITEM_TYPE;
  readonly system: Record<never, never>;
}

export class AgentOccupationConflictError extends Error {
  constructor(count: number) {
    super(`Agent owns ${count} Occupation Items; expected at most one.`);
    this.name = "AgentOccupationConflictError";
  }
}

export class InvalidOccupationSourceError extends Error {
  constructor() {
    super("The selected Item is not a valid Occupation source.");
    this.name = "InvalidOccupationSourceError";
  }
}

function embeddedItems(
  actor: foundry.documents.Actor,
): foundry.documents.Item[] {
  return [
    ...(actor.getEmbeddedCollection("Item") as Iterable<foundry.documents.Item>),
  ];
}

function assertAgent(actor: foundry.documents.Actor): void {
  if (actor.type !== AGENT_ACTOR_TYPE) {
    throw new TypeError("Occupations can only be assigned to Agent Actors.");
  }
}

export function getAgentOccupationItems(
  actor: foundry.documents.Actor,
): foundry.documents.Item[] {
  return embeddedItems(actor).filter(
    (item) => item.type === OCCUPATION_ITEM_TYPE,
  );
}

export function getAgentOccupation(
  actor: foundry.documents.Actor,
): foundry.documents.Item | null {
  const occupations = getAgentOccupationItems(actor);
  if (occupations.length > 1) {
    throw new AgentOccupationConflictError(occupations.length);
  }
  return occupations[0] ?? null;
}

export function createOccupationSnapshot(
  source: foundry.documents.Item,
): OccupationItemSnapshot {
  if (source.type !== OCCUPATION_ITEM_TYPE) {
    throw new InvalidOccupationSourceError();
  }

  return {
    name: source.name,
    img: source.img ?? OCCUPATION_FALLBACK_IMAGE,
    type: OCCUPATION_ITEM_TYPE,
    system: {},
  };
}

export function createLegacyOccupationSnapshot(
  name: string,
): OccupationItemSnapshot {
  return {
    name,
    img: OCCUPATION_FALLBACK_IMAGE,
    type: OCCUPATION_ITEM_TYPE,
    system: {},
  };
}

export async function setAgentOccupation(
  actor: foundry.documents.Actor,
  source: foundry.documents.Item,
): Promise<foundry.documents.Item> {
  assertAgent(actor);
  const current = getAgentOccupation(actor);
  if (current?.id === source.id && source.actor === actor) return current;

  const snapshot = createOccupationSnapshot(source);
  if (current?.id) {
    const [updated] = await actor.updateEmbeddedDocuments("Item", [
      { _id: current.id, ...snapshot },
    ]);
    if (!updated) {
      throw new Error("Foundry did not return the updated Occupation Item.");
    }
    return updated as foundry.documents.Item;
  }

  const [created] = await actor.createEmbeddedDocuments("Item", [snapshot]);
  if (!created) {
    throw new Error("Foundry did not return the created Occupation Item.");
  }
  return created as foundry.documents.Item;
}

export async function clearAgentOccupation(
  actor: foundry.documents.Actor,
): Promise<void> {
  assertAgent(actor);
  const current = getAgentOccupation(actor);
  if (!current?.id) return;
  await actor.deleteEmbeddedDocuments("Item", [current.id]);
}
