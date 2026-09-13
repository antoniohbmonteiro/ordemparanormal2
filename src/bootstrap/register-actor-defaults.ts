import { AGENT_ACTOR_TYPE } from "../config/system-config";

interface ActorCreationData {
  readonly prototypeToken?: {
    readonly actorLink?: boolean | null;
    readonly disposition?: number | null;
    readonly displayBars?: number | null;
    readonly sight?: {
      readonly enabled?: boolean | null;
      readonly range?: number | null;
    } | null;
  };
}

interface PrototypeTokenDefaults extends Record<string, unknown> {
  actorLink?: boolean;
  disposition?: CONST.TokenDisposition;
  displayBars?: CONST.TokenDisplayMode;
  sight?: {
    enabled?: boolean;
    range?: number;
  };
}

function buildPrototypeTokenDefaults(
  creationData: ActorCreationData,
): PrototypeTokenDefaults {
  const source = creationData.prototypeToken;
  const defaults: PrototypeTokenDefaults = {};

  if (source?.actorLink === undefined) defaults.actorLink = true;
  if (source?.disposition === undefined) {
    defaults.disposition = CONST.TOKEN_DISPOSITIONS.FRIENDLY;
  }
  if (source?.displayBars === undefined) {
    defaults.displayBars = CONST.TOKEN_DISPLAY_MODES.OWNER_HOVER;
  }

  const sight: NonNullable<PrototypeTokenDefaults["sight"]> = {};
  if (source?.sight?.enabled === undefined) sight.enabled = true;
  if (source?.sight?.range === undefined) sight.range = 0;
  if (Object.keys(sight).length > 0) defaults.sight = sight;

  return defaults;
}

export function registerActorDefaults(): void {
  Hooks.on("preCreateActor", (document, data) => {
    const actor = document as foundry.documents.Actor;

    if (actor.type !== AGENT_ACTOR_TYPE) return;

    const creationData = data as ActorCreationData;

    const defaults = buildPrototypeTokenDefaults(creationData);
    if (Object.keys(defaults).length > 0) {
      actor.prototypeToken.updateSource(defaults);
    }
  });
}
