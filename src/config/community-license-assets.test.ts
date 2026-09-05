import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

const SEALS = [
  {
    name: "white",
    path: "../../assets/branding/community-license-seal-white.png",
    sha256: "80D01639E803F1F66B954FDC31BDCB63C12F6BE737E262FED221AF8D6FDF422C",
  },
  {
    name: "black",
    path: "../../assets/branding/community-license-seal-black.png",
    sha256: "48DE1CE0931166EA631AE9178FDBC4858B246ED7266DDA0174780FF571249BB7",
  },
] as const;

describe("official Community License seals", () => {
  it.each(SEALS)(
    "preserves the supplied $name PNG bytes and dimensions",
    async ({ path, sha256 }) => {
      const filePath = fileURLToPath(new URL(path, import.meta.url));
      const content = await readFile(filePath);

      expect(content.subarray(0, PNG_SIGNATURE.length)).toEqual(PNG_SIGNATURE);
      expect(content.readUInt32BE(16)).toBe(1942);
      expect(content.readUInt32BE(20)).toBe(1917);
      expect(createHash("sha256").update(content).digest("hex").toUpperCase()).toBe(
        sha256,
      );
    },
  );
});
