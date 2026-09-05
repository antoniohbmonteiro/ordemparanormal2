import {
  deserializeNarrativeScene,
  getActiveNarrativeScene,
  registerActiveNarrativeSceneSetting,
} from "../adapters/foundry/narrative-scenes/narrative-scene-setting";
import { registerNarrativeSidebarTab } from "../adapters/foundry/narrative-scenes/register-narrative-sidebar-tab";
import { synchronizeNarrativeSceneHud } from "../applications/narrative-scenes/narrative-scene-hud";
import { synchronizeNarrativeSidebarTabs } from "../applications/narrative-scenes/narrative-sidebar-tab";
import { SYSTEM_ID } from "../config/system-config";

function reportSynchronizationFailure(error: unknown): void {
  console.error(`${SYSTEM_ID} | Failed to synchronize Narrative Scene UI.`, error);
  if (game.user.isGM) {
    ui.notifications.error(
      game.i18n.localize(
        "ORDEMPARANORMAL2.NarrativeScene.Errors.SynchronizationFailed",
      ),
    );
  }
}

export async function handleNarrativeSceneSettingChange(
  value: unknown,
): Promise<void> {
  try {
    await Promise.all([
      synchronizeNarrativeSceneHud(deserializeNarrativeScene(value)),
      synchronizeNarrativeSidebarTabs(),
    ]);
  } catch (error) {
    reportSynchronizationFailure(error);
  }
}

export async function initializeNarrativeScenes(): Promise<void> {
  try {
    await synchronizeNarrativeSceneHud(getActiveNarrativeScene());
  } catch (error) {
    reportSynchronizationFailure(error);
  }
}

export function registerNarrativeScenes(): void {
  registerActiveNarrativeSceneSetting(handleNarrativeSceneSettingChange);
  registerNarrativeSidebarTab();
  Hooks.once("ready", () => {
    void initializeNarrativeScenes();
  });
}
