import { ensureChatCardPartialsLoaded } from "./adapters/foundry/chat/ensure-chat-card-partials-loaded";
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
import { SYSTEM_ID } from "./config/system-config";

Hooks.once("init", () => {
  registerChatMessageDocument();
  void ensureChatCardPartialsLoaded().catch((error) => {
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

  console.info(`${SYSTEM_ID} | Initializing system v${game.system.version}`);
});
