import { createCheckSnapshot } from "../application/checks/check-snapshot";
import { publishOpposedCheckMessage } from "../adapters/foundry/chat/publish-opposed-check-message";
import {
  resolveCheck,
  type CheckInput,
  type CheckRollOutcomes,
} from "../core/checks/check";

interface ResolvedScenarioCheck {
  readonly input: CheckInput;
  readonly outcomes: CheckRollOutcomes;
}

const LEFT_CHECK: ResolvedScenarioCheck = {
  input: {
    check: { kind: "skill", key: "fighting", name: "Luta" },
    components: [
      { kind: "attribute", key: "physical", label: "Físico", die: 8 },
      { kind: "skill", key: "fighting", label: "Luta", die: 6 },
    ],
    extraDice: [],
  },
  outcomes: {
    components: [
      { key: "physical", die: 8, result: 5 },
      { key: "fighting", die: 6, result: 4 },
    ],
    extraDice: [],
  },
};

const RIGHT_CHECK: ResolvedScenarioCheck = {
  input: {
    check: { kind: "skill", key: "fighting", name: "Luta" },
    components: [
      { kind: "attribute", key: "physical", label: "Físico", die: 8 },
      { kind: "skill", key: "fighting", label: "Luta", die: 4 },
    ],
    extraDice: [],
  },
  outcomes: {
    components: [
      { key: "physical", die: 8, result: 4 },
      { key: "fighting", die: 4, result: 3 },
    ],
    extraDice: [],
  },
};

function resolveScenarioCheck(scenario: ResolvedScenarioCheck) {
  return createCheckSnapshot(resolveCheck(scenario.input, scenario.outcomes));
}

export async function publishOpposedCheckScenario(
  leftActor: foundry.documents.Actor,
  rightActor: foundry.documents.Actor,
): Promise<void> {
  await publishOpposedCheckMessage({
    title: game.i18n.format("ORDEMPARANORMAL2.OpposedCheckCard.Title", {
      check: "Luta",
    }),
    subtitle: game.i18n.localize(
      "ORDEMPARANORMAL2.OpposedCheckCard.Subtitle",
    ),
    left: { actor: leftActor, check: resolveScenarioCheck(LEFT_CHECK) },
    right: { actor: rightActor, check: resolveScenarioCheck(RIGHT_CHECK) },
    winner: "left",
  });
}
