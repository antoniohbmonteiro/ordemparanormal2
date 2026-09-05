import { showLicenseNoticeIfRequired } from "../applications/license-notice";
import {
  LICENSE_NOTICE_SETTING_KEY,
  SYSTEM_ID,
} from "../config/system-config";

export function registerLicenseNotice(): void {
  game.settings.register(SYSTEM_ID, LICENSE_NOTICE_SETTING_KEY, {
    name: "ORDEMPARANORMAL2.LicenseNotice.SettingName",
    scope: "client",
    config: false,
    type: String,
    default: "",
  });

  Hooks.once("ready", () => {
    void showLicenseNoticeIfRequired();
  });
}
