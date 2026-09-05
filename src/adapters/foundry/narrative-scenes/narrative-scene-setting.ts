import {
  ACTIVE_NARRATIVE_SCENE_SETTING_KEY,
  SYSTEM_ID,
} from "../../../config/system-config";
import {
  createNarrativeScene,
  isNarrativeScene,
  type NarrativeScene,
} from "../../../core/narrative-scenes/narrative-scene";

export const NO_ACTIVE_NARRATIVE_SCENE = "" as const;

export function serializeNarrativeScene(
  scene: NarrativeScene | null,
): string {
  if (scene === null) return NO_ACTIVE_NARRATIVE_SCENE;

  return JSON.stringify(createNarrativeScene(scene.id, scene.name));
}

export function deserializeNarrativeScene(
  value: unknown,
): NarrativeScene | null {
  if (value === NO_ACTIVE_NARRATIVE_SCENE) return null;
  if (typeof value !== "string") {
    throw new TypeError("Narrative Scene setting must be a string.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch (error) {
    throw new TypeError("Narrative Scene setting contains invalid JSON.", {
      cause: error,
    });
  }

  if (!isNarrativeScene(parsed)) {
    throw new TypeError("Narrative Scene setting contains invalid data.");
  }

  return createNarrativeScene(parsed.id, parsed.name);
}

export function getActiveNarrativeScene(): NarrativeScene | null {
  return deserializeNarrativeScene(
    game.settings.get(SYSTEM_ID, ACTIVE_NARRATIVE_SCENE_SETTING_KEY),
  );
}

export async function setActiveNarrativeScene(
  scene: NarrativeScene | null,
): Promise<void> {
  await game.settings.set(
    SYSTEM_ID,
    ACTIVE_NARRATIVE_SCENE_SETTING_KEY,
    serializeNarrativeScene(scene),
  );
}

export function createNarrativeSceneId(): string {
  return foundry.utils.randomID();
}

export function registerActiveNarrativeSceneSetting(
  onChange: (value: unknown) => void | Promise<void>,
): void {
  game.settings.register(SYSTEM_ID, ACTIVE_NARRATIVE_SCENE_SETTING_KEY, {
    name: "ORDEMPARANORMAL2.NarrativeScene.SettingName",
    scope: "world",
    config: false,
    type: String,
    default: NO_ACTIVE_NARRATIVE_SCENE,
    onChange,
  });
}
