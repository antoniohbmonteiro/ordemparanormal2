import {
  areRequestedChecksEqual,
  type OpposedCheckStateV1,
} from "../../../application/checks/opposed-check-state";
import {
  CARD_PRESENTATION_FLAG,
  OPPOSED_CHECK_CARD_KIND,
  OPPOSED_CHECK_STATE_FLAG,
  SYSTEM_ID,
} from "../../../config/system-config";
import { buildStatefulOpposedCheckCardViewModel } from "../../../ui/chat/opposed-check-card-view-model";
import { ensureSharedPartialsLoaded } from "../templates/ensure-shared-partials-loaded";

const TEMPLATE = `systems/${SYSTEM_ID}/templates/chat/opposed-check-card.hbs`;

export function buildOpposedCheckTitle(state: OpposedCheckStateV1): string {
  return areRequestedChecksEqual(state)
    ? game.i18n.format("ORDEMPARANORMAL2.OpposedCheckCard.Title", {
        check: state.left.presentation.requestedCheckLabel,
      })
    : game.i18n.localize("ORDEMPARANORMAL2.OpposedCheckCard.GenericTitle");
}

export async function renderOpposedCheckContent(state: OpposedCheckStateV1): Promise<string> {
  await ensureSharedPartialsLoaded();
  return foundry.applications.handlebars.renderTemplate(
    TEMPLATE,
    buildStatefulOpposedCheckCardViewModel(
      state,
      buildOpposedCheckTitle(state),
      game.i18n.localize("ORDEMPARANORMAL2.OpposedCheckCard.Subtitle"),
    ),
  );
}

export async function createOpposedCheckMessage(state: OpposedCheckStateV1): Promise<ChatMessage> {
  const content = await renderOpposedCheckContent(state);
  const message = await ChatMessage.create({
    content,
    speaker: { alias: game.user.name },
    flags: {
      [SYSTEM_ID]: {
        [CARD_PRESENTATION_FLAG]: { card: OPPOSED_CHECK_CARD_KIND },
        [OPPOSED_CHECK_STATE_FLAG]: state,
      },
    },
  });
  if (!message) throw new Error("Foundry did not create the Opposed Check message.");
  return message;
}
