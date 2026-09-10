import type { CheckSnapshot } from "../../../application/checks/check-snapshot";
import {
  CARD_PRESENTATION_FLAG,
  OPPOSED_CHECK_CARD_KIND,
  SYSTEM_ID,
} from "../../../config/system-config";
import {
  buildOpposedCheckCardViewModel,
  type OpposedCheckWinnerSide,
} from "../../../ui/chat/opposed-check-card-view-model";
import { ensureSharedPartialsLoaded } from "../templates/ensure-shared-partials-loaded";

const OPPOSED_CHECK_CARD_TEMPLATE =
  `systems/${SYSTEM_ID}/templates/chat/opposed-check-card.hbs`;

interface OpposedCheckMessageParticipant {
  readonly actor: foundry.documents.Actor;
  readonly check: CheckSnapshot;
}

export interface OpposedCheckMessageInput {
  readonly title: string;
  readonly subtitle: string;
  readonly left: OpposedCheckMessageParticipant;
  readonly right: OpposedCheckMessageParticipant;
  readonly winner: OpposedCheckWinnerSide;
}

function readParticipant(participant: OpposedCheckMessageParticipant) {
  const img = participant.actor.img?.trim();

  return {
    name: participant.actor.name.trim(),
    ...(img ? { img } : {}),
    check: participant.check,
  };
}

export async function publishOpposedCheckMessage(
  input: OpposedCheckMessageInput,
): Promise<void> {
  await ensureSharedPartialsLoaded();
  const content = await foundry.applications.handlebars.renderTemplate(
    OPPOSED_CHECK_CARD_TEMPLATE,
    buildOpposedCheckCardViewModel({
      title: input.title,
      subtitle: input.subtitle,
      left: readParticipant(input.left),
      right: readParticipant(input.right),
      winner: input.winner,
    }),
  );

  await ChatMessage.create({
    content,
    speaker: { alias: game.user?.name ?? "" },
    flags: {
      [SYSTEM_ID]: {
        [CARD_PRESENTATION_FLAG]: { card: OPPOSED_CHECK_CARD_KIND },
      },
    },
  });
}
