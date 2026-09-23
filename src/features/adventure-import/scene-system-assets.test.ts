import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { SCENE_SYSTEM_ASSETS } from "./prepare-adventure-scenes";

const SYSTEM_PREFIX = "systems/ordemparanormal2/";
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

describe("packaged Scene system assets", () => {
  it.each(Object.entries(SCENE_SYSTEM_ASSETS))("ships %s with the system package", async (_id, path) => {
    expect(path.startsWith(SYSTEM_PREFIX)).toBe(true);
    const content = await readFile(fileURLToPath(new URL(`../../../${path.slice(SYSTEM_PREFIX.length)}`, import.meta.url)));
    expect(content.subarray(0, PNG_SIGNATURE.length)).toEqual(PNG_SIGNATURE);
  });
});
