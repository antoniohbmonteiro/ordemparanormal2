import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

describe("Check Request Dialog template", () => {
  it("contains only Agent, Skill, and optional DT fields", async () => {
    const template = await readFile(
      fileURLToPath(
        new URL(
          "../../../templates/checks/check-request-dialog.hbs",
          import.meta.url,
        ),
      ),
      "utf8",
    );
    expect(template).toContain('name="participant"');
    expect(template).toContain('name="skill"');
    expect(template).toContain('name="difficulty"');
    expect(template).not.toMatch(/aptitude|attribute|checkType/i);
  });

  it("uses the single-participant Opposed Check visual structure", async () => {
    const template = await readFile(
      fileURLToPath(
        new URL(
          "../../../templates/checks/check-request-dialog.hbs",
          import.meta.url,
        ),
      ),
      "utf8",
    );
    expect(template).toContain("op2-check-request-dialog__header");
    expect(template).toContain("op2-check-request-dialog__participant");
    expect(template).toContain("{{> opposedCheckPortrait");
    expect(template).toContain("op2-check-request-dialog__name");
    expect(template).toContain("op2-check-request-dialog__preview");
    expect(template).toContain("data-preview-skill");
    expect(template).toContain("data-preview-context");
  });

  it("keeps the pending card action centered and DT secondary", async () => {
    const styles = await readFile(
      fileURLToPath(
        new URL("../../../styles/check-request-card.css", import.meta.url),
      ),
      "utf8",
    );
    expect(styles).toMatch(
      /\.op2-check-request-card__actions\s*\{[^}]*justify-content:\s*center/s,
    );
    expect(styles).toMatch(
      /\.op2-check-request-card__difficulty\s*\{[^}]*color:\s*var\(--op2-check-muted\)[^}]*font-size:\s*0\.74rem/s,
    );
  });

  it("keeps the pending card control-free and reuses the shared header", async () => {
    const template = await readFile(
      fileURLToPath(
        new URL(
          "../../../templates/chat/check-request-card.hbs",
          import.meta.url,
        ),
      ),
      "utf8",
    );
    expect(template).toContain("{{> chatCardHeader");
    expect(template).toContain("data-check-request-actions");
    expect(template).not.toContain("<button");
    expect(template).toContain("CheckRequestCard.Awaiting");
  });
});
