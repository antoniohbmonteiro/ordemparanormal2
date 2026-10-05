import { SYSTEM_ID } from "../../../config/system-config";

/** A presentation revision asks Foundry to rerender the existing Check Message on every client. */
export async function refreshInvestigationShareCard(messageId: string): Promise<void> {
  const message = (game as typeof game & { messages?: { get(id: string): ChatMessage | undefined } }).messages?.get(messageId);
  if (!message) return;
  await message.update({ [`flags.${SYSTEM_ID}.investigationShareCardRevision`]: crypto.randomUUID() });
}
