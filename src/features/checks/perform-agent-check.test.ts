import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  buildAgentAttributeChoices: vi.fn(),
  buildAgentCheck: vi.fn(),
  canUserRollActor: vi.fn(),
  executeFoundryCheck: vi.fn(),
  openCheckDialog: vi.fn(),
  publishCheckMessage: vi.fn(),
  readAgentCheckSource: vi.fn(),
}));

vi.mock("../../application/checks/build-agent-check", () => ({
  buildAgentAttributeChoices: mocks.buildAgentAttributeChoices,
  buildAgentCheck: mocks.buildAgentCheck,
}));
vi.mock("../../applications/checks/check-dialog", () => ({
  openCheckDialog: mocks.openCheckDialog,
}));
vi.mock("../../adapters/foundry/actors/agent-check-permission", () => ({
  canUserRollActor: mocks.canUserRollActor,
}));
vi.mock("../../adapters/foundry/actors/read-agent-check-source", () => ({
  readAgentCheckSource: mocks.readAgentCheckSource,
}));
vi.mock("../../adapters/foundry/chat/publish-check-message", () => ({
  publishCheckMessage: mocks.publishCheckMessage,
}));
vi.mock("../../adapters/foundry/dice/execute-foundry-check", () => ({
  executeFoundryCheck: mocks.executeFoundryCheck,
}));

import {
  AgentCheckPermissionError,
  performAgentCheck,
} from "./perform-agent-check";

const actor = {} as foundry.documents.Actor;
const user = {} as foundry.documents.User;
const selection = { kind: "attribute", key: "mind" } as const;

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("game", {
    i18n: { localize: (key: string) => key },
    user,
  });
  mocks.openCheckDialog.mockResolvedValue({
    stepAdjustments: { mind: 0 },
    extraDice: [],
  });
  mocks.buildAgentAttributeChoices.mockReturnValue([]);
});

describe("perform Agent check", () => {
  it("stops before reading the Actor, rolling, or publishing without ownership", async () => {
    mocks.canUserRollActor.mockReturnValue(false);

    await expect(performAgentCheck(actor, selection)).rejects.toBeInstanceOf(
      AgentCheckPermissionError,
    );

    expect(mocks.readAgentCheckSource).not.toHaveBeenCalled();
    expect(mocks.executeFoundryCheck).not.toHaveBeenCalled();
    expect(mocks.publishCheckMessage).not.toHaveBeenCalled();
  });

  it("reads current Actor data before prompting, rolling, and publishing", async () => {
    const source = { attributes: {}, skills: {} };
    const input = {
      check: {},
      components: [
        { kind: "attribute", key: "mind", label: "Mente", die: 8 },
      ],
      extraDice: [],
    };
    const execution = { result: {}, roll: {} };
    mocks.canUserRollActor.mockReturnValue(true);
    mocks.readAgentCheckSource.mockReturnValue(source);
    mocks.buildAgentCheck.mockReturnValue(input);
    mocks.executeFoundryCheck.mockResolvedValue(execution);

    await performAgentCheck(actor, selection);

    expect(mocks.readAgentCheckSource).toHaveBeenCalledWith(actor);
    expect(mocks.buildAgentCheck).toHaveBeenCalledWith(
      selection,
      source,
      expect.any(Function),
    );
    expect(mocks.openCheckDialog).toHaveBeenCalledWith(input);
    expect(mocks.executeFoundryCheck).toHaveBeenCalledWith(input);
    expect(mocks.publishCheckMessage).toHaveBeenCalledWith(
      actor,
      execution,
      undefined,
    );
    expect(mocks.canUserRollActor).toHaveBeenCalledTimes(2);
  });

  it("stops without rolling or publishing when the dialog is canceled", async () => {
    mocks.canUserRollActor.mockReturnValue(true);
    mocks.readAgentCheckSource.mockReturnValue({ attributes: {}, skills: {} });
    mocks.buildAgentCheck.mockReturnValue({
      check: {},
      components: [],
      extraDice: [],
    });
    mocks.openCheckDialog.mockResolvedValue(null);

    await performAgentCheck(actor, selection);

    expect(mocks.executeFoundryCheck).not.toHaveBeenCalled();
    expect(mocks.publishCheckMessage).not.toHaveBeenCalled();
    expect(mocks.canUserRollActor).toHaveBeenCalledTimes(1);
  });

  it("publishes the resolved DT outcome from the effective input", async () => {
    const source = { attributes: {}, skills: {} };
    const input = {
      check: {},
      components: [
        { kind: "attribute", key: "mind", label: "Mente", die: 8 },
      ],
      extraDice: [],
    };
    const execution = { result: { total: 9 }, roll: {} };
    mocks.canUserRollActor.mockReturnValue(true);
    mocks.readAgentCheckSource.mockReturnValue(source);
    mocks.buildAgentCheck.mockReturnValue(input);
    mocks.openCheckDialog.mockResolvedValue({
      difficulty: 9,
      stepAdjustments: { mind: 0 },
      extraDice: [],
    });
    mocks.executeFoundryCheck.mockResolvedValue(execution);

    await performAgentCheck(actor, selection);

    expect(mocks.readAgentCheckSource).toHaveBeenCalledTimes(1);
    expect(mocks.buildAgentCheck).toHaveBeenCalledTimes(1);
    expect(mocks.openCheckDialog).toHaveBeenCalledWith(input);
    expect(mocks.executeFoundryCheck).toHaveBeenCalledWith(input);
    expect(mocks.publishCheckMessage).toHaveBeenCalledWith(actor, execution, {
      difficulty: 9,
      outcome: "success",
    });
  });

  it("applies temporary step adjustments independently before rolling", async () => {
    const input = {
      check: { kind: "skill", key: "research", name: "Pesquisar" },
      components: [
        { kind: "attribute", key: "mind", label: "Mente", die: 8 },
        { kind: "skill", key: "research", label: "Pesquisar", die: 6 },
      ],
      extraDice: [],
    };
    const execution = { result: { total: 15 }, roll: {} };
    mocks.canUserRollActor.mockReturnValue(true);
    mocks.readAgentCheckSource.mockReturnValue({ attributes: {}, skills: {} });
    mocks.buildAgentCheck.mockReturnValue(input);
    mocks.openCheckDialog.mockResolvedValue({
      stepAdjustments: { mind: 0, research: 1 },
      extraDice: [],
    });
    mocks.executeFoundryCheck.mockResolvedValue(execution);

    await performAgentCheck(actor, selection);

    expect(mocks.openCheckDialog).toHaveBeenCalledWith(input);
    expect(mocks.executeFoundryCheck).toHaveBeenCalledWith({
      check: input.check,
      components: [
        input.components[0],
        { ...input.components[1], die: 8 },
      ],
      extraDice: [],
    });
    expect(input.components.map(({ die }) => die)).toEqual([8, 6]);
    expect(mocks.readAgentCheckSource).toHaveBeenCalledTimes(1);
    expect(mocks.publishCheckMessage).toHaveBeenCalledWith(
      actor,
      execution,
      undefined,
    );
  });

  it("adds situational dice and resolves DT from the effective four-die total", async () => {
    const input = {
      check: { kind: "skill", key: "research", name: "Pesquisar" },
      components: [
        { kind: "attribute", key: "mind", label: "Mente", die: 8 },
        { kind: "skill", key: "research", label: "Pesquisar", die: 6 },
      ],
      extraDice: [],
    };
    const extraDice = [
      {
        id: "situational-1",
        die: 4,
        source: "situational",
        label: "Situacional",
      },
      {
        id: "situational-2",
        die: 8,
        source: "situational",
        label: "Situacional",
      },
    ];
    const execution = { result: { total: 17 }, roll: {} };
    mocks.canUserRollActor.mockReturnValue(true);
    mocks.readAgentCheckSource.mockReturnValue({ attributes: {}, skills: {} });
    mocks.buildAgentCheck.mockReturnValue(input);
    mocks.openCheckDialog.mockResolvedValue({
      difficulty: 17,
      stepAdjustments: { mind: 0, research: 0 },
      extraDice,
    });
    mocks.executeFoundryCheck.mockResolvedValue(execution);

    await performAgentCheck(actor, selection);

    expect(mocks.executeFoundryCheck).toHaveBeenCalledWith({
      check: input.check,
      components: input.components,
      extraDice,
    });
    expect(mocks.publishCheckMessage).toHaveBeenCalledWith(actor, execution, {
      difficulty: 17,
      outcome: "success",
    });
  });

  it("rolls a selected attribute with its slot adjustment and two extra dice", async () => {
    const skillSelection = { kind: "skill", key: "acrobatics" } as const;
    const source = {
      attributes: { physical: 10, mind: 6, emotion: 8 },
      skills: { acrobatics: 8 },
    };
    const attributeChoices = [
      { key: "physical", label: "Físico", die: 10 },
      { key: "mind", label: "Mente", die: 6 },
      { key: "emotion", label: "Emoção", die: 8 },
    ];
    const defaultInput = {
      check: { kind: "skill", key: "acrobatics", name: "Acrobacia" },
      components: [
        { kind: "attribute", key: "physical", label: "Físico", die: 10 },
        { kind: "skill", key: "acrobatics", label: "Acrobacia", die: 8 },
      ],
      extraDice: [],
    };
    const selectedInput = {
      ...defaultInput,
      components: [
        { kind: "attribute", key: "mind", label: "Mente", die: 6 },
        defaultInput.components[1],
      ],
    };
    const extraDice = [
      {
        id: "situational-1",
        die: 4,
        source: "situational",
        label: "Situacional",
      },
      {
        id: "situational-2",
        die: 8,
        source: "situational",
        label: "Situacional",
      },
    ];
    const execution = { result: { total: 19 }, roll: {} };
    mocks.canUserRollActor.mockReturnValue(true);
    mocks.readAgentCheckSource.mockReturnValue(source);
    mocks.buildAgentAttributeChoices.mockReturnValue(attributeChoices);
    mocks.buildAgentCheck
      .mockReturnValueOnce(defaultInput)
      .mockReturnValueOnce(selectedInput);
    mocks.openCheckDialog.mockResolvedValue({
      selectedAttribute: "mind",
      stepAdjustments: { mind: 1, acrobatics: 0 },
      extraDice,
    });
    mocks.executeFoundryCheck.mockResolvedValue(execution);

    await performAgentCheck(actor, skillSelection);

    expect(mocks.readAgentCheckSource).toHaveBeenCalledTimes(1);
    expect(mocks.buildAgentAttributeChoices).toHaveBeenCalledWith(
      source,
      expect.any(Function),
    );
    expect(mocks.openCheckDialog).toHaveBeenCalledWith(defaultInput, {
      attributeChoices,
    });
    expect(mocks.buildAgentCheck).toHaveBeenNthCalledWith(
      2,
      skillSelection,
      source,
      expect.any(Function),
      "mind",
    );
    expect(mocks.executeFoundryCheck).toHaveBeenCalledWith({
      check: selectedInput.check,
      components: [
        { kind: "attribute", key: "mind", label: "Mente", die: 8 },
        selectedInput.components[1],
      ],
      extraDice,
    });
    expect(mocks.publishCheckMessage).toHaveBeenCalledWith(
      actor,
      execution,
      undefined,
    );
  });

  it("rechecks permission before adjusting or rolling", async () => {
    const input = { check: {}, components: [], extraDice: [] };
    mocks.canUserRollActor
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(false);
    mocks.readAgentCheckSource.mockReturnValue({ attributes: {}, skills: {} });
    mocks.buildAgentCheck.mockReturnValue(input);
    mocks.openCheckDialog.mockResolvedValue({
      difficulty: 9,
      stepAdjustments: {},
      extraDice: [],
    });

    await expect(performAgentCheck(actor, selection)).rejects.toBeInstanceOf(
      AgentCheckPermissionError,
    );

    expect(mocks.openCheckDialog).toHaveBeenCalledWith(input);
    expect(mocks.executeFoundryCheck).not.toHaveBeenCalled();
    expect(mocks.publishCheckMessage).not.toHaveBeenCalled();
  });
});
