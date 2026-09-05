import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const template = readFileSync(
  fileURLToPath(
    new URL(
      "../../../templates/narrative-scenes/narrative-sidebar-tab.hbs",
      import.meta.url,
    ),
  ),
  "utf8",
);

describe("Narrative sidebar template", () => {
  it("renders inactive management as an accessible form", () => {
    expect(template).toContain("NarrativeScene.Sidebar.Inactive");
    expect(template).toContain('name="name"');
    expect(template).toContain('data-action="startNarrativeScene"');
  });

  it("renders the active name and ends the exact displayed scene", () => {
    expect(template).toContain("{{scene.name}}");
    expect(template).toContain('data-scene-id="{{scene.id}}"');
    expect(template).toContain('data-action="endNarrativeScene"');
  });

  it("guards every management action behind GM context", () => {
    expect(template.match(/{{#if canManage}}/g)).toHaveLength(2);
    expect(template).not.toContain("DialogV2");
  });
});
