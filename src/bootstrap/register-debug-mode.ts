import {
  DEBUG_MODE_SETTING_KEY,
  SYSTEM_ID,
} from "../config/system-config";
import {
  removeCheckQaGlobal,
  synchronizeCheckQaGlobal,
} from "../qa/check-qa-global";

let approvedEnable = false;
let effectiveDebugMode = false;
let pendingEnable: Promise<void> | null = null;

async function confirmDebugModeEnable(): Promise<boolean> {
  const result = await foundry.applications.api.DialogV2.confirm({
    classes: [SYSTEM_ID],
    content: game.i18n.localize(
      "ORDEMPARANORMAL2.DebugMode.Confirmation.Content",
    ),
    modal: true,
    rejectClose: false,
    window: {
      title: game.i18n.localize(
        "ORDEMPARANORMAL2.DebugMode.Confirmation.Title",
      ),
    },
    yes: {
      label: "ORDEMPARANORMAL2.DebugMode.Confirmation.Confirm",
      icon: "fa-solid fa-triangle-exclamation",
    },
    no: {
      label: "ORDEMPARANORMAL2.DebugMode.Confirmation.Cancel",
      default: true,
    },
  });

  return result === true;
}

async function performEnableConfirmation(): Promise<void> {
  removeCheckQaGlobal();
  await game.settings.set(SYSTEM_ID, DEBUG_MODE_SETTING_KEY, false);

  const confirmed = await confirmDebugModeEnable();
  if (!confirmed) return;

  approvedEnable = true;

  try {
    await game.settings.set(SYSTEM_ID, DEBUG_MODE_SETTING_KEY, true);
  } catch (error) {
    approvedEnable = false;
    throw error;
  }
}

export function handleDebugModeChange(value: unknown): Promise<void> {
  if (value !== true) {
    effectiveDebugMode = false;
    removeCheckQaGlobal();
    return Promise.resolve();
  }

  if (effectiveDebugMode) {
    synchronizeCheckQaGlobal();
    return Promise.resolve();
  }

  if (approvedEnable) {
    approvedEnable = false;
    effectiveDebugMode = true;
    synchronizeCheckQaGlobal();
    return Promise.resolve();
  }

  if (pendingEnable) return pendingEnable;

  pendingEnable = performEnableConfirmation().finally(() => {
    pendingEnable = null;
  });
  return pendingEnable;
}

function initializeDebugMode(): void {
  effectiveDebugMode =
    game.settings.get(SYSTEM_ID, DEBUG_MODE_SETTING_KEY) === true;
  synchronizeCheckQaGlobal();
}

export function registerDebugMode(): void {
  game.settings.register(SYSTEM_ID, DEBUG_MODE_SETTING_KEY, {
    name: "ORDEMPARANORMAL2.DebugMode.SettingName",
    hint: "ORDEMPARANORMAL2.DebugMode.SettingHint",
    scope: "client",
    config: true,
    type: Boolean,
    default: false,
    onChange: handleDebugModeChange,
  });

  Hooks.once("ready", initializeDebugMode);
}
