import { SYSTEM_ID } from "../../../config/system-config";

const CHAT_CARD_HEADER_TEMPLATE = `systems/${SYSTEM_ID}/templates/chat/chat-card-header.hbs`;
const OPPOSED_CHECK_PORTRAIT_TEMPLATE = `systems/${SYSTEM_ID}/templates/shared/opposed-check-portrait.hbs`;

let loadingPromise: Promise<unknown> | undefined;

export function ensureSharedPartialsLoaded(): Promise<unknown> {
  loadingPromise ??= foundry.applications.handlebars.loadTemplates({
    chatCardHeader: CHAT_CARD_HEADER_TEMPLATE,
    opposedCheckPortrait: OPPOSED_CHECK_PORTRAIT_TEMPLATE,
  });
  return loadingPromise;
}
