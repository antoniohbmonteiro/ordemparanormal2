import { CHECK_PRESENTATION_FLAG, SYSTEM_ID } from "../../../config/system-config";
import type { RadioSnapshot } from "../../../application/equipment/radio-snapshot";
import type { ResolvedAgentCheckInteraction } from "../../../features/checks/resolve-agent-check-interaction";
import { createCheckSnapshot } from "../../../application/checks/check-snapshot";
import { readAgentAccentColor } from "../actors/read-agent-accent-color";
import { renderCheckCardContent } from "./render-check-card-content";
import { isRegisteredMessageMode } from "./publish-check-message";

function published(operation: string, flag: string): boolean {
  return !!(game as typeof game & { messages?: { contents: ChatMessage[] } }).messages?.contents
    .some(message => message.getFlag(SYSTEM_ID, flag) === operation);
}
function privateRecipients(actor: foundry.documents.Actor): string[] {
  return (game.users as unknown as { contents: foundry.documents.User[] }).contents
    .filter(user => user.isGM || actor.testUserPermission(user, CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER)).map(user => user.id);
}
export async function publishRadioRemoval(actor: foundry.documents.Actor, operation: string, removedCount: number): Promise<void> {
  if (!Number.isSafeInteger(removedCount) || removedCount < 0) throw new Error("Invalid radio removal count.");
  if (published(operation, "radioRemovalOperation")) return;
  const key = removedCount === 0 ? "TuningNoneRemoved" : removedCount === 1 ? "TuningOneRemoved" : "TuningRemoved";
  const text = `${game.i18n.localize("ORDEMPARANORMAL2.Radio.Title")}: ${game.i18n.format(`ORDEMPARANORMAL2.Radio.${key}`, { count: removedCount })}`;
  const message = await ChatMessage.create({ content: `<p>${foundry.utils.escapeHTML(text)}</p>`,
    whisper: privateRecipients(actor), blind: false, speaker: ChatMessage.getSpeaker({ actor }),
    flags: { [SYSTEM_ID]: { radioRemovalOperation: operation } } });
  if (!message) throw new Error("Radio removal message was not created.");
}
export async function publishRadioCheck(actor: foundry.documents.Actor, requester: foundry.documents.User,
  operation: string, resolved: ResolvedAgentCheckInteraction, messageMode: string): Promise<void> {
  if (published(operation, "radioCheckOperation")) return;
  if (!isRegisteredMessageMode(messageMode)) throw new Error("Invalid Check message mode.");
  const snapshot = createCheckSnapshot(resolved.execution.result, resolved.difficultyResolution, resolved.appliedAbilityUses);
  const content = await renderCheckCardContent(snapshot);
  // Foundry supports registered string modes; the Roll declaration lists only built-in modes.
  const data: unknown = await (resolved.execution.roll as unknown as { toMessage(data: object, options: { messageMode: string; create: false }): Promise<unknown> }).toMessage({ author: requester.id, content,
    speaker: ChatMessage.getSpeaker({ actor }), flags: { [SYSTEM_ID]: { check: snapshot,
      radioCheckOperation: operation, [CHECK_PRESENTATION_FLAG]: { accentColor: readAgentAccentColor(actor) } } } }, { messageMode, create: false });
  if (!data || typeof data !== "object") throw new Error("Check message data was not prepared.");
  const message = await ChatMessage.create({ ...data, ...(messageMode === "self" ? { whisper: [requester.id] } : {}) });
  if (!message) throw new Error("Radio Check message was not created.");
}
export async function publishRadioResult(actor: foundry.documents.Actor, operation: string, snapshot: RadioSnapshot): Promise<void> {
  if (published(operation, "radioOperation")) return;
  const content = await foundry.applications.handlebars.renderTemplate(`systems/${SYSTEM_ID}/templates/chat/radio-result-card.hbs`, {
    ...snapshot, outcomeLabel: game.i18n.localize(`ORDEMPARANORMAL2.Radio.${snapshot.outcome}`),
    composition: snapshot.active.map(piece => piece.text).join(" "),
  });
  const message = await ChatMessage.create({ content, whisper: privateRecipients(actor), speaker: ChatMessage.getSpeaker({ actor }),
    flags: { [SYSTEM_ID]: { radioOperation: operation, radio: structuredClone(snapshot) } } });
  if (!message) throw new Error("Radio result message was not created.");
}
