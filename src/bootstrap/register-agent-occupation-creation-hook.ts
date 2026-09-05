import { AGENT_ACTOR_TYPE } from "../config/system-config";
import {
  preparePendingAgentOccupation,
  type PendingAgentSource,
} from "../migrations/prepare-pending-agent-occupation";

export function registerAgentOccupationCreationHook(): void {
  Hooks.on("preCreateActor", (document, data) => {
    const actor = document as foundry.documents.Actor;
    if (actor.type !== AGENT_ACTOR_TYPE) return;

    const source = data as PendingAgentSource;
    const preparation = preparePendingAgentOccupation(source);
    if (preparation.status === "unchanged") return;
    if (preparation.status === "conflict") {
      console.error(
        "ordemparanormal2 | Cancelled Agent creation because legacy Occupation data conflicts",
        {
          actor: { id: actor.id, name: actor.name, source },
          occupation: preparation.occupation,
          legacyOccupationFlag: preparation.legacyFlag,
        },
      );
      ui.notifications.error(
        game.i18n.localize(
          "ORDEMPARANORMAL2.Migrations.Occupation.CreationConflict",
        ),
      );
      return false;
    }

    actor.updateSource(preparation.update);
  });
}
