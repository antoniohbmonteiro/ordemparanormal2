import { expect, it } from "vitest";
import { validateBreakConfig, validateUnlockConfig } from "./configuration";
import { AccessChallengeError, accessChallengeErrorMessage } from "./errors";

const participant = { kind: "actor" as const, uuid: "Actor.agent" as const };

it("reports an empty descriptive obstacle with the requested Portuguese message", () => {
  expect(() => validateBreakConfig({ participant, obstacle: "   ", difficulty: 7, pa: 10 }))
    .toThrow("Informe o obstáculo a ser arrombado.");
});

it("exposes Portuguese validation messages for DT, PA and manual-secret faces", () => {
  expect(() => validateBreakConfig({ participant, obstacle: "Porta", difficulty: 0, pa: 10 }))
    .toThrow(new AccessChallengeError("Informe uma DT inteira maior ou igual a 1."));
  expect(() => validateBreakConfig({ participant, obstacle: "Porta", difficulty: 7, pa: 0 }))
    .toThrow(new AccessChallengeError("Informe uma PA inteira maior ou igual a 1."));
  expect(() => validateUnlockConfig({ participant, obstacle: "", diceCount: 1, die: 6,
    resistance: 3, secretMode: "manual", manualSecret: [7] }))
    .toThrow(new AccessChallengeError("Escolha valores de 1 a 6 para todas as posições da senha."));
});

it("shows only expected feature errors and keeps unexpected technical messages out of the UI", () => {
  expect(accessChallengeErrorMessage(new AccessChallengeError("Informe o obstáculo a ser arrombado.")))
    .toBe("Informe o obstáculo a ser arrombado.");
  const fallback = "Não foi possível criar o desafio. Confira a configuração e tente novamente.";
  expect(accessChallengeErrorMessage(new Error("Foundry document lookup failed."))).toBe(fallback);
  expect(accessChallengeErrorMessage("Internal error")).toBe(fallback);
});
