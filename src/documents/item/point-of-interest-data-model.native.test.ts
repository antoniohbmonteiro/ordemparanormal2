import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";

const commonPath = process.env.FOUNDRY_V14_COMMON_PATH;
afterEach(() => vi.unstubAllGlobals());
describe.skipIf(!commonPath)("installed Foundry v14 Point of Interest model (no persistence)", () => {
  it("round trips radio config, normalizes borders, and rejects mixed/conflicting branches", async () => {
    vi.stubGlobal("foundry", await import(/* @vite-ignore */ pathToFileURL(commonPath!).href));
    const { PointOfInterestDataModel: Model } = await import("./point-of-interest-data-model");
    const config = { type: "radio", trueFragments: [" O sinal ", "vem do porão"], falseFragments: ["na torre"] };
    const tool = { type: "tool", equipmentUuid: "Item.radio", useFormId: "tune", mechanicConfig: config };
    const info = (id: string, mechanicConfig: unknown = config) => ({ id, content: "", approaches: [{ ...tool, mechanicConfig }],
      availability: { mode: "always", condition: "" } });
    const model = new Model({ information: [info("a"), info("b")] } as never, { strict: true } as never);
    const expected = { type: "radio", trueFragments: ["O sinal", "vem do porão"], falseFragments: ["na torre"] };
    expect(model.toObject().information[0].approaches[0].mechanicConfig).toEqual(expected);
    expect(model.updateSource({ information: [info("a", { ...expected, falseFragments: [] }),
      info("b", { ...expected, falseFragments: [] })] } as never)).not.toEqual({});
    for (const invalid of [{ ...expected, trueFragments: [] }, { ...expected, falseFragments: ["O sinal"] },
      { ...expected, sequenceLength: 4 }, { ...expected, type: "unknown" }, { ...expected, trueFragments: [" "] }]) {
      expect(() => new Model({ information: [info("a", invalid)] } as never, { strict: true } as never)).toThrow();
      const before = model.toObject();
      try { model.updateSource({ information: [info("a", invalid)] } as never); } catch { /* Native cleaning can reject before validation. */ }
      expect(model.toObject()).toEqual(before);
    }
    expect(() => new Model({ information: [info("a", expected), info("b", { ...expected, falseFragments: [] })] } as never,
      { strict: true } as never)).toThrow();
  });
  it("round trips laboratory config without introducing it on other branches and rejects conflicts", async () => {
    vi.stubGlobal("foundry", await import(/* @vite-ignore */ pathToFileURL(commonPath!).href));
    const { PointOfInterestDataModel: Model } = await import("./point-of-interest-data-model");
    const tool = { type: "tool", equipmentUuid: "Item.lab", useFormId: "analyze",
      mechanicConfig: { type: "laboratory", sequenceLength: 4 } };
    const info = (id: string, approach = tool) => ({ id, content: "", approaches: [approach],
      availability: { mode: "always", condition: "" } });
    const model = new Model({ information: [info("a"), info("b")] } as never, { strict: true } as never);
    expect(model.toObject().information).toEqual([info("a"), info("b")]);
    model.updateSource({ information: [info("a", { ...tool, mechanicConfig: { type: "laboratory", sequenceLength: 6 } }),
      info("b", { ...tool, mechanicConfig: { type: "laboratory", sequenceLength: 6 } })] } as never);
    expect(model.toObject().information[0].approaches[0].mechanicConfig?.sequenceLength).toBe(6);
    for (const length of [3, 7, 4.5, "4", null]) {
      expect(() => new Model({ information: [info("a", { ...tool,
        mechanicConfig: { type: "laboratory", sequenceLength: length as number } })] } as never, { strict: true } as never)).toThrow();
      expect(() => model.updateSource({ information: [info("a", { ...tool,
        mechanicConfig: { type: "laboratory", sequenceLength: length as number } })] } as never)).toThrow();
    }
    expect(() => new Model({ information: [info("a"), info("b", { ...tool,
      mechanicConfig: { type: "laboratory", sequenceLength: 5 } })] } as never, { strict: true } as never)).toThrow();
    expect(model.updateSource({ information: [info("a"), info("b", { ...tool,
      mechanicConfig: { type: "laboratory", sequenceLength: 5 } })] } as never)).toEqual({});
    expect(model.toObject().information.every(entry => entry.approaches[0].mechanicConfig?.sequenceLength === 6)).toBe(true);
    expect(() => new Model({ information: [{ ...info("s"), approaches: [{ skill: "research", difficulty: 2,
      showDifficultyToPlayers: true, mechanicConfig: tool.mechanicConfig }] }] } as never, { strict: true } as never)).toThrow();
  });
  it("round-trips tool-only and mixed branches through construction and updateSource without artificial skill defaults", async () => {
    const native = await import(/* @vite-ignore */ pathToFileURL(commonPath!).href);
    vi.stubGlobal("foundry", native);
    const { PointOfInterestDataModel } = await import("./point-of-interest-data-model");
    const tool = { type: "tool", equipmentUuid: "Item.source", useFormId: "scan" };
    const skill = { skill: "aptitude", specialization: "arts", difficulty: 9, showDifficultyToPlayers: false,
      difficultyOverride: { difficulty: 6, condition: "Requer luz." } };
    const information = [
      { id: "only", content: "Temperatura", approaches: [tool], availability: { mode: "always", condition: "" } },
      { id: "mixed", content: "Vestígios", approaches: [skill, tool], availability: { mode: "situational", condition: "Requer chave." } },
    ];
    const model = new PointOfInterestDataModel({ publicDescription: "", gmContext: "", information: structuredClone(information) } as never, { strict: true } as never);
    expect(JSON.parse(JSON.stringify(model.toObject().information))).toEqual(information);
    model.updateSource({ information: structuredClone([information[1], information[0]]) } as never);
    expect(JSON.parse(JSON.stringify(model.toObject().information))).toEqual([information[1], information[0]]);
    const legacy = new PointOfInterestDataModel({ information: [{ id: "old", content: "", approaches: [{ skill: "perception" }] }] } as never);
    expect(legacy.toObject().information[0].approaches[0]).toEqual({ skill: "perception", difficulty: 1, showDifficultyToPlayers: true });
  });

  it("rejects duplicate tool identities, invalid UUIDs and fields from the other union branch", async () => {
    const native = await import(/* @vite-ignore */ pathToFileURL(commonPath!).href);
    vi.stubGlobal("foundry", native);
    const { PointOfInterestDataModel } = await import("./point-of-interest-data-model");
    const tool = { type: "tool", equipmentUuid: "Compendium.test.tools.Item.source", useFormId: "scan" };
    for (const approaches of [[tool, tool], [{ ...tool, skill: "research" }], [{ ...tool, difficulty: 1 }],
      [{ ...tool, equipmentUuid: "Actor.a.Item.e" }], [{ ...tool, useFormId: "" }]]) {
      expect(() => new PointOfInterestDataModel({ information: [{ id: "a", content: "", approaches }] } as never,
        { strict: true } as never)).toThrow();
    }
  });
  it("cleans stored information without availability to always and rejects a blank situational condition", async () => {
    const native = await import(/* @vite-ignore */ pathToFileURL(commonPath!).href);
    vi.stubGlobal("foundry", native);
    const { PointOfInterestDataModel } = await import("./point-of-interest-data-model");
    const approach = { skill: "perception", difficulty: 6, showDifficultyToPlayers: false };
    const legacy = new PointOfInterestDataModel({ publicDescription: "", gmContext: "",
      information: [{ id: "clue", content: "Pista", approaches: [approach] }] } as never);
    expect(legacy.toObject().information).toEqual([{ id: "clue", content: "Pista", approaches: [approach],
      availability: { mode: "always", condition: "" } }]);
    const situational = { mode: "situational", condition: "Requer a chave." };
    const valid = new PointOfInterestDataModel({ publicDescription: "", gmContext: "",
      information: [{ id: "clue", content: "Pista", approaches: [approach], availability: situational }] } as never);
    expect(valid.toObject().information[0].availability).toEqual(situational);
    expect(() => new PointOfInterestDataModel({ publicDescription: "", gmContext: "",
      information: [{ id: "clue", content: "Pista", approaches: [approach],
        availability: { mode: "situational", condition: " " } }] } as never, { strict: true } as never)).toThrow();
  });

  it("keeps a stored approach without an alternative DT serialized exactly as before and validates one when present", async () => {
    const native = await import(/* @vite-ignore */ pathToFileURL(commonPath!).href);
    vi.stubGlobal("foundry", native);
    const { PointOfInterestDataModel } = await import("./point-of-interest-data-model");
    const approach = { skill: "research", difficulty: 6, showDifficultyToPlayers: false };
    const source = { publicDescription: "", gmContext: "",
      information: [{ id: "clue", content: "Pista", approaches: [approach], availability: { mode: "always", condition: "" } }] };
    const stored = new PointOfInterestDataModel(structuredClone(source) as never);
    expect(JSON.parse(JSON.stringify(stored.toObject()))).toEqual(source);
    const override = { difficulty: 10, condition: "Se o armário for arrombado." };
    const withOverride = { ...source, information: [{ ...source.information[0], approaches: [{ ...approach, difficultyOverride: override }] }] };
    expect(new PointOfInterestDataModel(structuredClone(withOverride) as never, { strict: true } as never).toObject()
      .information[0].approaches[0].difficultyOverride).toEqual(override);
    expect(() => new PointOfInterestDataModel({ ...source, information: [{ ...source.information[0],
      approaches: [{ ...approach, difficultyOverride: { difficulty: 10, condition: " " } }] }] } as never,
    { strict: true } as never)).toThrow();
  });

  it("accepts the ItemSheet read, mutate and update flow through native in-place cleaning", async () => {
    const native = await import(/* @vite-ignore */ pathToFileURL(commonPath!).href);
    vi.stubGlobal("foundry", native);
    const { PointOfInterestDataModel } = await import("./point-of-interest-data-model");
    const { addPointOfInterestInformation, readPointOfInterestInformation, updatePointOfInterestInformationAvailability } =
      await import("./point-of-interest-data");
    const approach = { skill: "perception" as const, difficulty: 6, showDifficultyToPlayers: false };
    const model = new PointOfInterestDataModel({ publicDescription: "", gmContext: "",
      information: [{ id: "clue", content: "Pista", approaches: [approach] }] } as never);
    const added = addPointOfInterestInformation(readPointOfInterestInformation(model), "new", approach);
    model.updateSource({ information: updatePointOfInterestInformationAvailability(added, "clue",
      { mode: "situational", condition: "Requer a chave." }) } as never);
    expect(model.toObject().information.map(entry => [entry.id, entry.availability])).toEqual([
      ["clue", { mode: "situational", condition: "Requer a chave." }], ["new", { mode: "always", condition: "" }],
    ]);
  });
});
