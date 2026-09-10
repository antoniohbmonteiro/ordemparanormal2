import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const template = readFileSync(
  resolve(process.cwd(), "templates/chat/opposed-check-card.hbs"),
  "utf8",
);
const styles = readFileSync(
  resolve(process.cwd(), "styles/opposed-check-card.css"),
  "utf8",
);
const shellTemplate = readFileSync(
  resolve(process.cwd(), "templates/chat/chat-message-shell.hbs"),
  "utf8",
);

describe("opposed check card template", () => {
  it("renders the shared header and both equally important participants", () => {
    expect(template).toContain("{{> chatCardHeader title=title subtitle=subtitle}}");
    expect(template).toContain("{{left.img}}");
    expect(template).toContain("{{right.img}}");
    expect(template).toContain("{{left.total}}");
    expect(template).toContain("{{right.total}}");
    expect(template).toContain("OpposedCheckCard.Versus");
    expect(template).not.toContain("speakerActor");
  });

  it("protects participant names and context from overflow with full tooltips", () => {
    expect(template).toContain('title="{{left.name}}"');
    expect(template).toContain('title="{{right.name}}"');
    expect(template).toContain('title="{{left.context}}"');
    expect(template).toContain('title="{{right.context}}"');
    expect(styles).toMatch(
      /\.op2-opposed-check-card__name,[\s\S]*?min-width:\s*0;[\s\S]*?text-overflow:\s*ellipsis;[\s\S]*?white-space:\s*nowrap;/,
    );
  });

  it("keeps the matchup horizontal at normal chat width", () => {
    expect(styles).toMatch(
      /\.op2-opposed-check-card__matchup\s*{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\) 1\.25rem minmax\(0, 1fr\);/,
    );
    expect(styles).not.toMatch(
      /\.op2-opposed-check-card__matchup\s*{[^}]*flex-direction:\s*column/,
    );
    expect(styles).not.toMatch(/@media[^\{]*max-width/);
  });

  it("renders a compact winner banner and one collapsible breakdown for both Checks", () => {
    expect(template).toContain("fa-trophy");
    expect(template).toContain("{{winner.name}}");
    expect(template.match(/<details/g)).toHaveLength(1);
    expect(template).toContain("{{left.contributingFormula}}");
    expect(template).toContain("{{right.contributingFormula}}");
    expect(template).toContain("{{#each left.dice}}");
    expect(template).toContain("{{#each right.dice}}");
    expect(template).toContain("op2-opposed-check-card__chevron");
  });

  it("leaves the optional external portrait under shell control", () => {
    expect(template).not.toContain("op2-chat-message__portrait");
    expect(shellTemplate).toMatch(
      /{{#if portrait}}[\s\S]*?op2-chat-message__portrait[\s\S]*?{{\/if}}/,
    );
  });
});
