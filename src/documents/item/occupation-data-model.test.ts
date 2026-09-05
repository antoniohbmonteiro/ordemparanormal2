import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

class MockTypeDataModel {}
let OccupationDataModel: typeof import("./occupation-data-model").OccupationDataModel;

beforeAll(async () => {
  vi.stubGlobal("foundry", {
    abstract: { TypeDataModel: MockTypeDataModel },
  });
  ({ OccupationDataModel } = await import("./occupation-data-model"));
});

afterAll(() => vi.unstubAllGlobals());

describe("OccupationDataModel", () => {
  it("defines no speculative system fields", () => {
    expect(OccupationDataModel.defineSchema()).toEqual({});
  });
});
