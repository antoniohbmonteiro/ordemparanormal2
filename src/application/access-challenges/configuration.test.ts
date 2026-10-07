import { expect, it } from "vitest";
import translations from "../../../lang/pt-BR.json";
import { validateBreakConfig, validateUnlockConfig } from "./configuration";
import { AccessChallengeError, accessChallengeErrorMessage } from "./errors";

const localize = (key: string): string => {
  const value = key.split(".").reduce<unknown>((value, part) => (value as Record<string, unknown>)[part], translations);
  if (typeof value !== "string") throw new Error(`Missing localization: ${key}`);
  return value;
};
const format = (key: string, parameters: Readonly<Record<string, string | number>>) =>
  localize(key).replace(/\{(\w+)\}/g, (_, name: string) => String(parameters[name]));
const message = (error: unknown) => accessChallengeErrorMessage(error, localize, format);
const participant = { kind: "actor" as const, uuid: "Actor.agent" as const };

function validationMessage(validate: () => void): string {
  try { validate(); }
  catch (error) { expect(error).toBeInstanceOf(AccessChallengeError); return message(error); }
  throw new Error("Expected validation to fail.");
}

it("reports an empty descriptive obstacle with the same localized Portuguese message", () => {
  expect(validationMessage(() => validateBreakConfig({ participant, obstacle: "   ", difficulty: 7, pa: 10 })))
    .toBe("Informe o obstáculo a ser arrombado.");
});

it("preserves localized validation messages and formats manual-secret faces", () => {
  expect(validationMessage(() => validateBreakConfig({ participant, obstacle: "Porta", difficulty: 0, pa: 10 })))
    .toBe("Informe uma DT inteira maior ou igual a 1.");
  expect(validationMessage(() => validateBreakConfig({ participant, obstacle: "Porta", difficulty: 7, pa: 0 })))
    .toBe("Informe uma PA inteira maior ou igual a 1.");
  expect(validationMessage(() => validateUnlockConfig({ participant, obstacle: "", diceCount: 1, die: 6,
    resistance: 3, secretMode: "manual", manualSecret: [7] })))
    .toBe("Escolha valores de 1 a 6 para todas as posições da senha.");
});

it("localizes only expected feature errors and keeps unexpected technical messages out of the UI", () => {
  expect(message(new AccessChallengeError("ORDEMPARANORMAL2.AccessChallenges.Validation.Obstacle")))
    .toBe("Informe o obstáculo a ser arrombado.");
  const fallback = "Não foi possível criar o desafio. Confira a configuração e tente novamente.";
  expect(message(new Error("Foundry document lookup failed."))).toBe(fallback);
  expect(message("Internal error")).toBe(fallback);
});
