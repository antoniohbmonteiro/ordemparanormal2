import { SYSTEM_ID } from "../config/system-config";
import type ClientKeybindings from "@client/helpers/interaction/client-keybindings.mjs";
import { investigationMode } from "../adapters/foundry/points-of-interest/investigation-mode";
import { syncInvestigationModeControl } from "../adapters/foundry/points-of-interest/poi-scene-controls";

export function registerInvestigationMode(): void {
  investigationMode.subscribe(syncInvestigationModeControl);
  const { keybindings } = game as typeof game & { keybindings: Pick<ClientKeybindings, "register"> };
  keybindings.register(SYSTEM_ID, "investigationMode", {
    name: "ORDEMPARANORMAL2.PointOfInterest.SceneControls.InvestigationMode",
    editable: [{ key: "KeyI", modifiers: [] }],
    restricted: false,
    repeat: false,
    onDown: () => { investigationMode.toggle(); return true; },
  });
}
