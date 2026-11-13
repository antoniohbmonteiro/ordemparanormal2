import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildAgentCheck } from "../../application/checks/build-agent-check";
import { resolveCheck, resolveCheckDifficulty, type CheckInput } from "../../core/checks/check";
import { analyzeCheckRoll } from "../../core/checks/check-roll-analysis";
import { ThreatDataModel } from "../../documents/actor/threat-data-model";
import { executeFoundryCheck } from "../../adapters/foundry/dice/execute-foundry-check";
import { publishCheckMessage } from "../../adapters/foundry/chat/publish-check-message";
import { openCheckDialog } from "../../applications/checks/check-dialog";
import { performThreatCheck } from "./perform-threat-check";

vi.mock("../../documents/actor/threat-data-model", () => ({ ThreatDataModel: class ThreatDataModel {} }));
vi.mock("../../adapters/foundry/dice/execute-foundry-check", () => ({ executeFoundryCheck: vi.fn() }));
vi.mock("../../adapters/foundry/chat/publish-check-message", () => ({ publishCheckMessage: vi.fn() }));
vi.mock("../../applications/checks/check-dialog", () => ({ openCheckDialog: vi.fn() }));

const selection = { kind: "skill", key: "fighting" } as const;
const localize = (key: string) => key;
const dialogResult = { difficulty: 13, stepAdjustments: { physical: 0, fighting: 0 }, extraDice: [], abilityUses: [] };

function fixture() {
  const attributes = { physical: 8, mind: 4, emotion: 4 } as const;
  const system = Object.assign(Object.create(ThreatDataModel.prototype), {
    attributes, skills: [{ ...selection, die: 6 }], actions: [],
  });
  const testUserPermission = vi.fn(() => true);
  return { actor: { system, testUserPermission } as unknown as foundry.documents.Actor, attributes, testUserPermission };
}

function resultWithSixes(input: CheckInput) {
  return resolveCheck(input, {
    components: input.components.map(({ key, die }) => ({ key, die, result: 6 })), extraDice: [],
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("CONST", { DOCUMENT_OWNERSHIP_LEVELS: { OWNER: 3 } });
  vi.stubGlobal("game", { user: { isGM: false }, i18n: { localize } });
});

afterEach(() => vi.unstubAllGlobals());

describe("Threat check flow", () => {
  it("shares Agent dice and DT resolution when the roll is a critical", async () => {
    const { actor, attributes } = fixture();
    const token = Object.create(null) as foundry.documents.TokenDocument;
    const roll = Object.create(null) as foundry.dice.Roll;
    vi.mocked(openCheckDialog).mockResolvedValue(dialogResult);
    vi.mocked(executeFoundryCheck).mockImplementation(async (input) => ({ roll, result: resultWithSixes(input) }));
    await expect(performThreatCheck(actor, selection, token)).resolves.toBe("published");

    const agentInput = buildAgentCheck(selection, { attributes, skills: { fighting: 6 } }, localize);
    const agentResult = resultWithSixes(agentInput);
    const difficulty = resolveCheckDifficulty(agentResult.total, dialogResult.difficulty);
    expect(analyzeCheckRoll([6, 6]).critical).toBe("positive");
    expect(difficulty.outcome).toBe("failure");
    expect(publishCheckMessage).toHaveBeenCalledWith(actor, { roll, result: agentResult }, difficulty, [], undefined, token);
  });

  it("skips execution on cancellation or loss of roll permission", async () => {
    const { actor, testUserPermission } = fixture();
    vi.mocked(openCheckDialog).mockResolvedValueOnce(null);
    await expect(performThreatCheck(actor, selection)).resolves.toBe("cancelled");
    testUserPermission.mockReturnValueOnce(true).mockReturnValueOnce(false);
    vi.mocked(openCheckDialog).mockResolvedValueOnce(dialogResult);
    await expect(performThreatCheck(actor, selection)).resolves.toBe("forbidden");
    expect(executeFoundryCheck).not.toHaveBeenCalled();
    expect(publishCheckMessage).not.toHaveBeenCalled();
  });

  it("discards an open dialog when its action was deleted", async () => {
    const { actor } = fixture();
    if (!(actor.system instanceof ThreatDataModel)) throw new Error("Missing threat fixture.");
    const actions = actor.system.actions;
    actions.push({
      id: "claws", name: "Garras", check: { ...selection, attribute: null },
      damage: null, typeLabel: "", requirements: "", description: "",
    });
    vi.mocked(openCheckDialog).mockImplementationOnce(async () => {
      actions.pop();
      return dialogResult;
    });
    await expect(performThreatCheck(actor, { kind: "action", id: "claws" })).resolves.toBe("changed");
    expect(executeFoundryCheck).not.toHaveBeenCalled();
  });
});
