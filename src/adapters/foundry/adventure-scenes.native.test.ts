import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createAdventureScenePort } from "./adventure-scenes";
import { sceneImportFixture } from "../../features/adventure-import/adventure-scene-test-fixtures";
import { prepareAdventureScenes } from "../../features/adventure-import/prepare-adventure-scenes";

const commonPath = process.env.FOUNDRY_V14_COMMON_PATH;
afterEach(() => vi.unstubAllGlobals());
describe.skipIf(!commonPath)("installed Foundry v14 Scene models (no persistence)", () => {
  it("validates both complete prepared Scenes against native document schemas", async () => {
    const native = await import(/* @vite-ignore */ pathToFileURL(commonPath!).href);
    const f = sceneImportFixture({ materializedActs: ["actOne", "actTwo"] });
    for (const [i, actor] of f.actors.entries()) actor._id = `agent0000000000${i}`;
    vi.stubGlobal("CONFIG", { Token: { movement: { actions: {} } }, Canvas: { lightAnimations: {} }, Wall: { doorAnimations: {}, doorSounds: {} } });
    vi.stubGlobal("game", { release: { version: "14.367" }, userId: "validationUser00", user: { id: "validationUser00", isGM: true },
      users: { activeGM: { id: "validationUser00" } }, system: { id: "ordemparanormal2", version: "0.3.0", grid: { type: 1, distance: 1, units: "" } },
      i18n: { localize: (key: string) => key, format: (key: string) => key }, actors: { contents: [] }, scenes: { contents: [] } });
    vi.stubGlobal("foundry", { ...native, documents: { ...native.documents, Scene: { implementation: native.documents.BaseScene } } });
    const plans = await prepareAdventureScenes(f.input);
    expect(plans.map(plan => plan.preset.id)).toEqual(["actOne.basement", "actTwo.basement"]);
    for (const plan of plans) expect(() => createAdventureScenePort().validateCandidate(plan.desired)).not.toThrow();
    f.writes().forEach(fn => expect(fn).not.toHaveBeenCalled());
  });
});
