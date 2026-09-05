import { SYSTEM_ID } from "../../../config/system-config";

const CHAT_CARD_HEADER_TEMPLATE =
  `systems/${SYSTEM_ID}/templates/chat/chat-card-header.hbs`;

let loadingPromise: Promise<unknown> | undefined;

/**
 * Idempotent, memoized guard for the shared chat card Handlebars partials.
 * Never catches: a real loading failure must propagate to every caller.
 */
export function ensureChatCardPartialsLoaded(): Promise<unknown> {
  loadingPromise ??= foundry.applications.handlebars.loadTemplates({
    chatCardHeader: CHAT_CARD_HEADER_TEMPLATE,
  });

  return loadingPromise;
}
