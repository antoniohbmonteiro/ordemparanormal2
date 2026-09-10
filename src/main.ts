import { ensureSharedPartialsLoaded } from "./adapters/foundry/templates/ensure-shared-partials-loaded";
import { registerActorDefaults } from "./bootstrap/register-actor-defaults";
import { registerChatMessageDocument } from "./bootstrap/register-chat-message-document";
import { registerDataModels } from "./bootstrap/register-data-models";
import { registerDebugMode } from "./bootstrap/register-debug-mode";
import { registerLicenseNotice } from "./bootstrap/register-license-notice";
import { registerSheets } from "./bootstrap/register-sheets";
import { registerUniqueAgentItemHooks } from "./bootstrap/register-unique-agent-item-hooks";
import { registerDataMigrations } from "./bootstrap/register-data-migrations";
import { registerAgentOccupationCreationHook } from "./bootstrap/register-agent-occupation-creation-hook";
import { registerNarrativeScenes } from "./bootstrap/register-narrative-scenes";
import { registerPoiSceneControls } from "./bootstrap/register-poi-scene-controls";
import { registerPoiRegionConfig } from "./bootstrap/register-poi-region-config";
import { registerPoiCanvas } from "./bootstrap/register-poi-canvas";
import { registerPoiInvestigation } from "./bootstrap/register-poi-investigation";
import { registerInvestigationMode } from "./bootstrap/register-investigation-mode";
import { registerGmTools } from "./bootstrap/register-gm-tools";
import { registerOpposedChecks } from "./bootstrap/register-opposed-checks";
import { SYSTEM_ID } from "./config/system-config";

Hooks.once("init", () => {
  registerChatMessageDocument();
  void ensureSharedPartialsLoaded().catch((error) => {
    console.error(`${SYSTEM_ID} | Failed to preload chat card partials`, error);
  });
  registerDataModels();
  registerSheets();
  registerActorDefaults();
  registerUniqueAgentItemHooks();
  registerAgentOccupationCreationHook();
  registerDataMigrations();
  registerLicenseNotice();
  registerDebugMode();
  registerNarrativeScenes();
  registerPoiSceneControls();
  registerGmTools();
  registerOpposedChecks();
  registerInvestigationMode();
  registerPoiRegionConfig();
  registerPoiCanvas();
  registerPoiInvestigation();

  console.info(`${SYSTEM_ID} | Initializing system v${game.system.version}`);
});
