import { synchronizeGmToolkit } from "../applications/gm-tools/gm-toolkit-controller";
import { SYSTEM_ID } from "../config/system-config";

export function registerGmToolkit(): void {
  Hooks.once("ready", () => {
    void synchronizeGmToolkit().catch((error) => {
      console.error(`${SYSTEM_ID} | Failed to initialize GM Toolkit`, error);
    });
  });
}
