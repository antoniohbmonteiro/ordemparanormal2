import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { beforeAll, describe, expect, it } from "vitest";

let hudTemplate = "";
let hudSource = "";

beforeAll(async () => {
  [hudTemplate, hudSource] = await Promise.all([
    readFile(
      fileURLToPath(
        new URL(
          "../../../templates/narrative-scenes/narrative-scene-hud.hbs",
          import.meta.url,
        ),
      ),
      "utf8",
    ),
    readFile(new URL("./narrative-scene-hud.ts", import.meta.url), "utf8"),
  ]);
});

describe("Narrative Scene HUD", () => {
  it("is the same strictly informational presentation for every user", () => {
    expect(hudTemplate).toContain('role="status"');
    expect(hudTemplate).toContain("{{scene.name}}");
    expect(hudTemplate).not.toMatch(/<button|<form|<input|data-action|contenteditable/i);
    expect(hudTemplate).not.toContain("{{#if");
    expect(hudSource).not.toContain("game.user");
    expect(hudSource).not.toContain("actions:");
  });

  it("does not expose an end or management action", () => {
    expect(hudTemplate).not.toMatch(/encerrar|fechar|gerenciar/i);
    expect(hudSource).not.toMatch(/endNarrativeScene|openNarrativeSceneControl/);
  });
});
