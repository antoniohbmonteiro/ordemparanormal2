import type { CheckSnapshot } from "../../../application/checks/check-snapshot";
import { SYSTEM_ID } from "../../../config/system-config";
import { buildCheckCardViewModel } from "../../../ui/chat/check-card-view-model";
import { ensureSharedPartialsLoaded } from "../templates/ensure-shared-partials-loaded";

const CHECK_CARD_TEMPLATE = `systems/${SYSTEM_ID}/templates/chat/check-card.hbs`;

export async function renderCheckCardContent(
  snapshot: CheckSnapshot,
): Promise<string> {
  await ensureSharedPartialsLoaded();
  return foundry.applications.handlebars.renderTemplate(
    CHECK_CARD_TEMPLATE,
    buildCheckCardViewModel(snapshot),
  );
}
