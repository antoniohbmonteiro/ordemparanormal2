import {
  COMMUNITY_LICENSE_URL,
  LICENSE_NOTICE_SETTING_KEY,
  LICENSE_NOTICE_VERSION,
  SYSTEM_ID,
} from "../config/system-config";

const LICENSE_NOTICE_TEMPLATE =
  "systems/ordemparanormal2/templates/applications/license-notice.hbs";
const LICENSE_NOTICE_SEAL =
  "systems/ordemparanormal2/assets/branding/community-license-seal-white.png";

export function shouldShowLicenseNotice(acceptedVersion: unknown): boolean {
  return acceptedVersion !== LICENSE_NOTICE_VERSION;
}

function readDoNotShowAgain(button: HTMLButtonElement): boolean {
  const field = button.form?.elements.namedItem("doNotShowAgain");

  if (!(field instanceof HTMLInputElement)) {
    throw new Error("Missing license notice preference field.");
  }

  return field.checked;
}

export async function showLicenseNoticeIfRequired(): Promise<void> {
  const acceptedVersion = game.settings.get(
    SYSTEM_ID,
    LICENSE_NOTICE_SETTING_KEY,
  );

  if (!shouldShowLicenseNotice(acceptedVersion)) return;

  const content = await foundry.applications.handlebars.renderTemplate(
    LICENSE_NOTICE_TEMPLATE,
    {
      licenseUrl: COMMUNITY_LICENSE_URL,
      sealPath: LICENSE_NOTICE_SEAL,
    },
  );
  const { DialogV2 } = foundry.applications.api;

  const shouldPersist = await DialogV2.prompt({
    classes: ["ordemparanormal2", "op2-license-notice"],
    content,
    modal: true,
    ok: {
      action: "understood",
      label: "ORDEMPARANORMAL2.LicenseNotice.Actions.Understood",
      default: true,
      callback: (_event, button) => readDoNotShowAgain(button),
    },
    position: {
      width: 520,
    },
    rejectClose: false,
    window: {
      title: game.i18n.localize("ORDEMPARANORMAL2.LicenseNotice.Title"),
      resizable: false,
    },
  });

  if (shouldPersist !== true) return;

  try {
    await game.settings.set(
      SYSTEM_ID,
      LICENSE_NOTICE_SETTING_KEY,
      LICENSE_NOTICE_VERSION,
    );
  } catch (error) {
    console.error(`${SYSTEM_ID} | Failed to save license notice preference.`, error);
    ui.notifications.error(
      game.i18n.localize("ORDEMPARANORMAL2.LicenseNotice.Errors.SaveFailed"),
    );
  }
}
