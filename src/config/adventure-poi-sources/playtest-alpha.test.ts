import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { PLAYTEST_ALPHA_POI_REVISION, PLAYTEST_ALPHA_POI_SOURCES } from "./playtest-alpha";

describe("Playtest Alpha POI technical catalog", () => {
  it("keeps every published always-available information ID exactly as released", () => {
    const published = PLAYTEST_ALPHA_POI_SOURCES.map(source => [source.id, source.informationIds]);
    expect(published.flatMap(([, ids]) => ids)).toHaveLength(125);
    // Fingerprint of the revision 3 [sourceId, informationIds] pairs; any rename, reorder or removal changes it.
    expect(createHash("sha256").update(JSON.stringify(published)).digest("hex"))
      .toBe("8b896b1cde11b3558006df180876aaa301bebc0a7712e0479d7a085ebe9f7950");
  });

  it("binds each situational row explicitly to a new ID that is unique within its POI", () => {
    const bindings = PLAYTEST_ALPHA_POI_SOURCES.flatMap(source => (source.situationalInformation ?? [])
      .map(binding => ({ source, binding })));
    expect(bindings).toHaveLength(34);
    for (const { source, binding } of bindings) {
      expect(binding.id).toMatch(/^[a-z][A-Za-z]+$/u);
      expect(Number.isInteger(binding.row) && binding.row >= 0).toBe(true);
      expect(source.informationIds).not.toContain(binding.id);
      expect(source.contextRowIndexes ?? []).not.toContain(binding.row);
    }
    expect(PLAYTEST_ALPHA_POI_SOURCES.find(source => source.id === "actOne.map.24")?.situationalInformation?.map(binding => binding.row))
      .toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    expect(PLAYTEST_ALPHA_POI_REVISION).toBe(4);
  });
});
