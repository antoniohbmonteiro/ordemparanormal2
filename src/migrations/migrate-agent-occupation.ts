import {
  AGENT_ACTOR_TYPE,
  LEGACY_OCCUPATION_FLAG,
  SYSTEM_ID,
} from "../config/system-config";
import {
  createLegacyOccupationSnapshot,
  getAgentOccupationItems,
} from "../features/occupations/manage-agent-occupation";
import {
  createLegacyOccupationData,
  readLegacyOccupationData,
} from "./legacy-occupation-data";

interface LegacyAgentSystem {
  readonly occupation?: unknown;
}

export async function migratePersistedAgentOccupation(
  actor: foundry.documents.Actor,
): Promise<void> {
  if (actor.type !== AGENT_ACTOR_TYPE) return;
  const occupation = (actor.system as unknown as LegacyAgentSystem).occupation;
  if (typeof occupation !== "string" || occupation.length === 0) return;

  const occupations = getAgentOccupationItems(actor);
  if (occupations.length === 0) {
    const [created] = await actor.createEmbeddedDocuments("Item", [
      createLegacyOccupationSnapshot(occupation),
    ]);
    if (!created) {
      throw new Error(
        `Foundry did not create the legacy Occupation for Agent ${actor.id}.`,
      );
    }
    await actor.update({ "system.occupation": "" });
    return;
  }

  const rawFlag = actor.getFlag(SYSTEM_ID, LEGACY_OCCUPATION_FLAG);
  const legacyFlag = readLegacyOccupationData(rawFlag);
  if (rawFlag !== undefined && legacyFlag?.value !== occupation) {
    throw new Error(
      `Agent ${actor.id} has conflicting legacy Occupation values.`,
    );
  }
  if (!legacyFlag) {
    await actor.setFlag(
      SYSTEM_ID,
      LEGACY_OCCUPATION_FLAG,
      createLegacyOccupationData(occupation),
    );
  }
  await actor.update({ "system.occupation": "" });
}

export async function migrateAgentOccupations(
  actors: Iterable<foundry.documents.Actor>,
): Promise<void> {
  for (const actor of actors) {
    await migratePersistedAgentOccupation(actor);
  }
}
