import type { OpposedCheckParticipantReference } from "../../../application/checks/opposed-check-configuration";
import { AGENT_ACTOR_TYPE } from "../../../config/system-config";

export type OpposedCheckParticipantGroup = "scene" | "world";

export interface OpposedCheckParticipantCandidate {
  readonly reference: OpposedCheckParticipantReference;
  readonly effectiveActor: foundry.documents.Actor;
  readonly label: string;
  readonly img: string;
  readonly group: OpposedCheckParticipantGroup;
}

interface SceneTokenLike {
  readonly actorLink: boolean;
  readonly actor: foundry.documents.Actor | null;
  readonly name: string;
  readonly uuid: string | null;
}

interface OpposedCheckParticipantCatalogSource {
  readonly sceneTokens: Iterable<SceneTokenLike>;
  readonly worldActors: Iterable<foundry.documents.Actor>;
}

function isWorldActorUuid(value: string | null): value is `Actor.${string}` {
  return typeof value === "string" && /^Actor\.[^.]+$/.test(value);
}

function isSceneTokenUuid(
  value: string | null,
): value is `Scene.${string}.Token.${string}` {
  return (
    typeof value === "string" && /^Scene\.[^.]+\.Token\.[^.]+$/.test(value)
  );
}

function compareCandidates(
  left: OpposedCheckParticipantCandidate,
  right: OpposedCheckParticipantCandidate,
): number {
  return (
    left.label.localeCompare(right.label, "pt-BR", { sensitivity: "base" }) ||
    left.reference.uuid.localeCompare(right.reference.uuid)
  );
}

function disambiguateSceneLabels(
  candidates: readonly OpposedCheckParticipantCandidate[],
): readonly OpposedCheckParticipantCandidate[] {
  const labelCounts = new Map<string, number>();

  for (const candidate of candidates) {
    labelCounts.set(candidate.label, (labelCounts.get(candidate.label) ?? 0) + 1);
  }

  return candidates.map((candidate) => {
    if ((labelCounts.get(candidate.label) ?? 0) < 2) return candidate;

    const tokenId = candidate.reference.uuid.split(".").at(-1) ?? "";
    return {
      ...candidate,
      label: `${candidate.label} · ${tokenId.slice(-4)}`,
    };
  });
}

export function buildOpposedCheckParticipantCatalog(
  source: OpposedCheckParticipantCatalogSource,
): readonly OpposedCheckParticipantCandidate[] {
  const representedWorldActorUuids = new Set<string>();
  const representedTokenUuids = new Set<string>();
  const sceneCandidates: OpposedCheckParticipantCandidate[] = [];

  for (const token of source.sceneTokens) {
    const actor = token.actor;
    if (!actor || actor.type !== AGENT_ACTOR_TYPE) continue;

    if (token.actorLink === true) {
      if (!isWorldActorUuid(actor.uuid)) continue;
      if (representedWorldActorUuids.has(actor.uuid)) continue;

      representedWorldActorUuids.add(actor.uuid);
      sceneCandidates.push({
        reference: { kind: "actor", uuid: actor.uuid },
        effectiveActor: actor,
        label: actor.name,
        img: actor.img ?? "icons/svg/mystery-man.svg",
        group: "scene",
      });
      continue;
    }

    if (token.actorLink !== false || !isSceneTokenUuid(token.uuid)) continue;
    if (representedTokenUuids.has(token.uuid)) continue;

    representedTokenUuids.add(token.uuid);
    sceneCandidates.push({
      reference: { kind: "token", uuid: token.uuid },
      effectiveActor: actor,
      label: token.name === actor.name ? actor.name : `${actor.name} — ${token.name}`,
      img: actor.img ?? "icons/svg/mystery-man.svg",
      group: "scene",
    });
  }

  sceneCandidates.sort(compareCandidates);
  const worldCandidates: OpposedCheckParticipantCandidate[] = [];

  for (const actor of source.worldActors) {
    if (
      actor.type !== AGENT_ACTOR_TYPE ||
      !isWorldActorUuid(actor.uuid) ||
      representedWorldActorUuids.has(actor.uuid)
    ) {
      continue;
    }

    worldCandidates.push({
      reference: { kind: "actor", uuid: actor.uuid },
      effectiveActor: actor,
      label: actor.name,
      img: actor.img ?? "icons/svg/mystery-man.svg",
      group: "world",
    });
  }

  worldCandidates.sort(compareCandidates);
  return [...disambiguateSceneLabels(sceneCandidates), ...worldCandidates];
}

export function listOpposedCheckParticipantCandidates(): readonly OpposedCheckParticipantCandidate[] {
  const runtime = globalThis as typeof globalThis & {
    readonly canvas?: {
      readonly scene?: { readonly tokens: Iterable<SceneTokenLike> } | null;
    };
  };
  const foundryGame = game as typeof game & {
    readonly actors?: Iterable<foundry.documents.Actor>;
  };

  return buildOpposedCheckParticipantCatalog({
    sceneTokens: runtime.canvas?.scene?.tokens ?? [],
    worldActors: foundryGame.actors ?? [],
  });
}
