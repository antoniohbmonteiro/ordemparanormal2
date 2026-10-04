import { SYSTEM_ID } from "../../../config/system-config";
import type { LaboratorySnapshot } from "../../../application/equipment/laboratory-snapshot";

export async function publishLaboratoryResult(actor: foundry.documents.Actor, operationKey: string,
  snapshot: LaboratorySnapshot): Promise<void> {
  const existing = (game as typeof game & { messages?: { contents: ChatMessage[] } }).messages?.contents
    .some(message => message.getFlag(SYSTEM_ID, "laboratoryOperation") === operationKey);
  if (existing) return;
  const content = await foundry.applications.handlebars.renderTemplate(
    `systems/${SYSTEM_ID}/templates/chat/laboratory-result-card.hbs`, {
      ...snapshot, outcomeLabel: game.i18n.localize(`ORDEMPARANORMAL2.Laboratory.${snapshot.outcome}`),
      sequence: snapshot.dice.map((die, index) => ({ die, value: snapshot.results[index] ?? "—" })),
      history: snapshot.rerolls.map(entry => ({ completed: entry.completed, positions: entry.positions.map(position => position + 1).join(", "),
        results: entry.results.join(", ") })),
    });
  const whisper = (game.users as unknown as { contents: foundry.documents.User[] }).contents
    .filter(user => user.isGM || actor.testUserPermission(user, CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER)).map(user => user.id);
  const message = await ChatMessage.create({ content, whisper, speaker: ChatMessage.getSpeaker({ actor }),
    rolls: [...snapshot.rolls], flags: { [SYSTEM_ID]: { laboratoryOperation: operationKey, laboratory: structuredClone(snapshot) } } });
  if (!message) throw new Error("Laboratory result message was not created.");
}
