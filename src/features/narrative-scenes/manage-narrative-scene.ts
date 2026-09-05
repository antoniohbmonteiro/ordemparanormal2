import {
  createNarrativeSceneId,
  getActiveNarrativeScene,
  setActiveNarrativeScene,
} from "../../adapters/foundry/narrative-scenes/narrative-scene-setting";
import {
  createNarrativeScene,
  type NarrativeScene,
} from "../../core/narrative-scenes/narrative-scene";

export type StartNarrativeSceneResult =
  | { readonly status: "started"; readonly scene: NarrativeScene }
  | { readonly status: "already-active"; readonly scene: NarrativeScene }
  | { readonly status: "invalid-name" }
  | { readonly status: "forbidden" };

export type EndNarrativeSceneResult =
  | { readonly status: "ended"; readonly scene: NarrativeScene }
  | { readonly status: "inactive" }
  | { readonly status: "stale"; readonly scene: NarrativeScene }
  | { readonly status: "forbidden" };

export async function startNarrativeScene(
  name: string,
): Promise<StartNarrativeSceneResult> {
  if (!game.user.isGM) return { status: "forbidden" };

  const current = getActiveNarrativeScene();
  if (current) return { status: "already-active", scene: current };
  if (typeof name !== "string" || name.trim().length === 0) {
    return { status: "invalid-name" };
  }

  const scene = createNarrativeScene(createNarrativeSceneId(), name);
  await setActiveNarrativeScene(scene);
  return { status: "started", scene };
}

export async function endNarrativeScene(
  expectedSceneId: string,
): Promise<EndNarrativeSceneResult> {
  if (!game.user.isGM) return { status: "forbidden" };

  const current = getActiveNarrativeScene();
  if (!current) return { status: "inactive" };
  if (current.id !== expectedSceneId) {
    return { status: "stale", scene: current };
  }

  await setActiveNarrativeScene(null);
  return { status: "ended", scene: current };
}
