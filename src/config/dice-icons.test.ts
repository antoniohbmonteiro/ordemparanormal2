import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const DICE_ICONS = [
  ["d4.svg", "4F3AF6D37D175A6B1DA97C71DF146C5C97C1B1D6D354F6379CF98130C18AFCEB"],
  ["d6.svg", "A67CAEB01784D9F5C4E936E3F76B81E04A437204B6137EC2B1E857C2A694756A"],
  ["d8.svg", "A9885D39F1D62C641C8EC7F64A1F96B994AAB8C15D693E7348D9A7A25524208A"],
  ["d10.svg", "C1E51264C77D212F4CD5A93A55BBFFBCE3F21A07B0CC9F2D7CDB7207EC073E0B"],
  ["d12.svg", "8403FBD0738B47C117C0689083E55129466CE774D7355DFDC32FF46060B2BBA1"],
] as const;

describe("dice icon assets", () => {
  it.each(DICE_ICONS)("preserves the supplied transparent %s", async (name, sha256) => {
    const filePath = fileURLToPath(
      new URL(`../../assets/icons/dice/${name}`, import.meta.url),
    );
    const content = await readFile(filePath);
    const svg = content.toString("utf8");

    expect(createHash("sha256").update(content).digest("hex").toUpperCase()).toBe(
      sha256,
    );
    expect(svg).toContain('viewBox="0 0 512 512"');
    expect(svg).toContain('fill="#fff"');
    expect(svg).not.toContain("<rect");
  });
});
