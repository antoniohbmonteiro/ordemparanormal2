import { AGENT_ACTOR_TYPE } from "../config/system-config";

interface ActorCreationData {
  readonly prototypeToken?: {
    readonly actorLink?: boolean;
  };
}

export function registerActorDefaults(): void {
  Hooks.on("preCreateActor", (document, data) => {
    const actor = document as foundry.documents.Actor;

    if (actor.type !== AGENT_ACTOR_TYPE) return;

    const creationData = data as ActorCreationData;

    // Preserve an explicitly supplied value.
    if (creationData.prototypeToken?.actorLink !== undefined) return;

    actor.prototypeToken.updateSource({
      actorLink: true,
    });
  });
}