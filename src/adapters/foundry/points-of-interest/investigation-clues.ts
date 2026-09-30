import { SYSTEM_ID } from "../../../config/system-config";
import { investigationParticipants, sceneInvestigationRuntime } from "./investigation-runtime";
import { serializePoiItemMutation } from "./poi-runtime-queries";

const SCENE_JOURNAL_FLAG = "investigationClueJournalUuid";
const JOURNAL_STATE_FLAG = "investigationClues";
const JOURNAL_STATE_PATH = `flags.${SYSTEM_ID}.${JOURNAL_STATE_FLAG}`;
const SCENE_JOURNAL_PATH = `flags.${SYSTEM_ID}.${SCENE_JOURNAL_FLAG}`;

export interface NarrativeClue {
  readonly id: string;
  readonly runId: string;
  readonly text: string;
  readonly knownAgentUuids: readonly string[];
}

function readJournalClues(journal: foundry.documents.JournalEntry): readonly NarrativeClue[] {
  const raw = journal.getFlag(SYSTEM_ID, JOURNAL_STATE_FLAG);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
  const clues = (raw as { clues?: unknown }).clues;
  if (!Array.isArray(clues)) return [];
  return clues.flatMap(value => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return [];
    const { id, runId, text, knownAgentUuids } = value as Record<string, unknown>;
    if (typeof id !== "string" || !id || typeof runId !== "string" || !runId
      || typeof text !== "string" || !Array.isArray(knownAgentUuids)
      || !knownAgentUuids.every(uuid => typeof uuid === "string" && /^Actor\.[^.]+$/u.test(uuid))) return [];
    return [{ id, runId, text, knownAgentUuids: [...new Set(knownAgentUuids as string[])] }];
  });
}

function journalFor(scene: foundry.documents.Scene): foundry.documents.JournalEntry | null {
  const uuid = scene.getFlag(SYSTEM_ID, SCENE_JOURNAL_FLAG);
  if (typeof uuid !== "string" || !/^JournalEntry\.[^.]+$/u.test(uuid)) return null;
  const journal = game.journal.get(uuid.slice("JournalEntry.".length));
  if (!journal || journal.uuid !== uuid) return null;
  const flag = journal.getFlag(SYSTEM_ID, JOURNAL_STATE_FLAG);
  return flag && typeof flag === "object" && !Array.isArray(flag)
    && (flag as { sceneId?: unknown }).sceneId === scene.id ? journal : null;
}

export function narrativeCluesForScene(scene: foundry.documents.Scene): readonly NarrativeClue[] {
  const journal = journalFor(scene);
  return journal ? readJournalClues(journal) : [];
}

export function knownNarrativeClues(scene: foundry.documents.Scene, actorUuid: string): readonly NarrativeClue[] {
  return narrativeCluesForScene(scene).filter(clue => clue.knownAgentUuids.includes(actorUuid));
}

async function ensureJournal(scene: foundry.documents.Scene): Promise<foundry.documents.JournalEntry> {
  const existing = journalFor(scene);
  if (existing) return existing;
  const created = await foundry.documents.JournalEntry.create({
    name: `Pistas da investigação — ${scene.name}`,
    ownership: { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE },
    flags: { [SYSTEM_ID]: { [JOURNAL_STATE_FLAG]: { schemaVersion: 1, sceneId: scene.id, clues: [] } } },
  });
  if (!created?.uuid) throw new Error("Investigation clue Journal was not created.");
  await scene.update({ [SCENE_JOURNAL_PATH]: created.uuid });
  return created;
}

export async function createNarrativeClue(
  scene: foundry.documents.Scene, runId: string, text: string, actorUuids: readonly string[], clueId: string = crypto.randomUUID(),
): Promise<NarrativeClue> {
  return serializePoiItemMutation(`investigation-journal:${scene.id}`, async () => {
    if (!game.user?.isGM || game.users.activeGM?.id !== game.user.id) throw new Error("Only the active GM can create clues.");
    const runtime = sceneInvestigationRuntime(scene);
    if (!runtime || runtime.runId !== runId || !text.trim()) throw new Error("Investigation is no longer active.");
    const participants = new Set(investigationParticipants(scene).map(actor => actor.uuid));
    if (actorUuids.some(uuid => !participants.has(uuid))) throw new Error("Invalid clue recipient.");
    const journal = await ensureJournal(scene);
    if (sceneInvestigationRuntime(scene)?.runId !== runId) throw new Error("Investigation is no longer active.");
    const existing = readJournalClues(journal).find(clue => clue.id === clueId);
    if (existing) {
      if (existing.runId !== runId || existing.text !== text.trim()
        || JSON.stringify(existing.knownAgentUuids) !== JSON.stringify([...new Set(actorUuids)]))
        throw new Error("Narrative clue ID already belongs to another grant.");
      return existing;
    }
    const clue: NarrativeClue = { id: clueId, runId, text: text.trim(),
      knownAgentUuids: [...new Set(actorUuids)] };
    await journal.update({ [JOURNAL_STATE_PATH]: foundry.data.operators.ForcedReplacement.create({
      schemaVersion: 1, sceneId: scene.id, clues: [...readJournalClues(journal), clue],
    }) });
    return clue;
  });
}

export async function transferNarrativeClue(
  scene: foundry.documents.Scene, runId: string, clueId: string, fromActorUuid: string, toActorUuid: string,
): Promise<boolean> {
  return serializePoiItemMutation(`investigation-journal:${scene.id}`, async () => {
    if (!game.user?.isGM || game.users.activeGM?.id !== game.user.id) throw new Error("Only the active GM can transfer clues.");
    if (sceneInvestigationRuntime(scene)?.runId !== runId) return false;
    const journal = journalFor(scene);
    const clues = journal ? readJournalClues(journal) : [];
    const clue = clues.find(entry => entry.id === clueId && entry.runId === runId
      && entry.knownAgentUuids.includes(fromActorUuid));
    if (!journal || !clue || !investigationParticipants(scene).some(actor => actor.uuid === toActorUuid)) return false;
    if (clue.knownAgentUuids.includes(toActorUuid)) return true;
    await journal.update({ [JOURNAL_STATE_PATH]: foundry.data.operators.ForcedReplacement.create({
      schemaVersion: 1, sceneId: scene.id,
      clues: clues.map(entry => entry.id === clueId
        ? { ...entry, knownAgentUuids: [...entry.knownAgentUuids, toActorUuid] } : entry),
    }) });
    return true;
  });
}

export async function grantNarrativeClue(
  scene: foundry.documents.Scene, runId: string, clueId: string, actorUuids: readonly string[],
): Promise<boolean> {
  return serializePoiItemMutation(`investigation-journal:${scene.id}`, async () => {
    if (!game.user?.isGM || game.users.activeGM?.id !== game.user.id
      || sceneInvestigationRuntime(scene)?.runId !== runId) return false;
    const participants = new Set(investigationParticipants(scene).map(actor => actor.uuid));
    if (!actorUuids.length || actorUuids.some(uuid => !participants.has(uuid))) return false;
    const journal = journalFor(scene);
    const clues = journal ? readJournalClues(journal) : [];
    const clue = clues.find(entry => entry.id === clueId && entry.runId === runId);
    if (!journal || !clue) return false;
    const next = [...new Set([...clue.knownAgentUuids, ...actorUuids])];
    if (next.length === clue.knownAgentUuids.length) return true;
    await journal.update({ [JOURNAL_STATE_PATH]: foundry.data.operators.ForcedReplacement.create({
      schemaVersion: 1, sceneId: scene.id,
      clues: clues.map(entry => entry.id === clueId ? { ...entry, knownAgentUuids: next } : entry),
    }) });
    return true;
  });
}
