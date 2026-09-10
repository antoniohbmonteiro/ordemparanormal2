import { synchronizeGmToolsPalette } from "../applications/gm-tools/gm-tools-palette-controller";
import { SYSTEM_ID } from "../config/system-config";

export function registerGmTools(): void {
  Hooks.once("ready", () => {
    void synchronizeGmToolsPalette().catch((error) => {
      console.error(`${SYSTEM_ID} | Failed to initialize GM Tools Palette`, error);
    });
  });
}
