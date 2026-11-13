import {
  DEBUG_MODE_SETTING_KEY,
  SYSTEM_ID,
} from "../config/system-config";
import {
  publishCheckScenario,
  type CheckQaScenarioKey,
} from "./check-scenarios";
import { publishOpposedCheckScenario } from "./opposed-check-scenario";
import { convertThreatAbilities, previewThreatAbilityConversion } from "./threat-ability-conversion";

interface OrdemParanormal2QaApi {
  previewThreatAbilityConversion: typeof previewThreatAbilityConversion;
  convertThreatAbilities: typeof convertThreatAbilities;
  publishCheckScenario(
    actor: foundry.documents.Actor,
    scenarioKey: CheckQaScenarioKey,
  ): Promise<void>;
  publishOpposedCheckScenario(
    leftActor: foundry.documents.Actor,
    rightActor: foundry.documents.Actor,
  ): Promise<void>;
}

type QaGlobal = typeof globalThis & {
  ordemparanormal2Qa?: OrdemParanormal2QaApi;
};

export function registerCheckQaGlobal(): void {
  (globalThis as QaGlobal).ordemparanormal2Qa = Object.freeze({
    publishCheckScenario,
    publishOpposedCheckScenario,
    previewThreatAbilityConversion,
    convertThreatAbilities,
  });
}

export function removeCheckQaGlobal(): void {
  delete (globalThis as QaGlobal).ordemparanormal2Qa;
}

export function synchronizeCheckQaGlobal(): void {
  const debugMode = game.settings.get(
    SYSTEM_ID,
    DEBUG_MODE_SETTING_KEY,
  );

  if (debugMode === true && game.user?.isGM === true) {
    registerCheckQaGlobal();
    return;
  }

  removeCheckQaGlobal();
}
