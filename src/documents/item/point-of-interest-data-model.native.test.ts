import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";

const commonPath = process.env.FOUNDRY_V14_COMMON_PATH;
afterEach(() => vi.unstubAllGlobals());
describe.skipIf(!commonPath)("installed Foundry v14 Point of Interest model (no persistence)", () => {
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
