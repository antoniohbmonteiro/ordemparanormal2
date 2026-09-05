import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  APTITUDE_SPECIALIZATION_ICON_PATHS,
  resolveAptitudeSpecializationIconPath,
  resolveSkillIconPath,
  SKILL_ICON_PATHS,
} from "./skill-icons";

const ICON_PATHS = [
  ...Object.values(SKILL_ICON_PATHS),
  ...Object.values(APTITUDE_SPECIALIZATION_ICON_PATHS),
];

describe("skill icon presentation registry", () => {
  it("resolves skill and Aptitude specialization icons independently", () => {
    expect(resolveSkillIconPath("athletics")).toBe(
      "systems/ordemparanormal2/assets/icons/skills/athletics.svg",
    );
    expect(resolveSkillIconPath("aptitude")).toBe(
      "systems/ordemparanormal2/assets/icons/skills/aptitude.svg",
    );
    expect(resolveAptitudeSpecializationIconPath("arts")).toBe(
      "systems/ordemparanormal2/assets/icons/skills/aptitude/arts.svg",
    );
  });

  it("returns no icon for unknown historical keys", () => {
    expect(resolveSkillIconPath("historical-skill")).toBeUndefined();
    expect(
      resolveAptitudeSpecializationIconPath("historical-specialization"),
    ).toBeUndefined();
  });

  it("registers 26 distinct canonical SVG assets", () => {
    expect(Object.keys(SKILL_ICON_PATHS)).toHaveLength(20);
    expect(Object.keys(APTITUDE_SPECIALIZATION_ICON_PATHS)).toHaveLength(6);
    expect(new Set(ICON_PATHS).size).toBe(26);
  });

  it.each(ICON_PATHS)("keeps %s transparent and structurally usable", async (path) => {
    const relativePath = path.replace(
      "systems/ordemparanormal2/assets/icons/skills/",
      "",
    );
    const svg = await readFile(
      fileURLToPath(
        new URL(`../../../assets/icons/skills/${relativePath}`, import.meta.url),
      ),
      "utf8",
    );

    expect(svg).toMatch(/^<svg\b/);
    expect(svg).toContain('viewBox="0 0 512 512"');
    expect(svg).toContain("<path");
    expect(svg).toContain('fill="#fff"');
    expect(svg).not.toContain("<rect");
  });
});
