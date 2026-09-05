import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { beforeAll, describe, expect, it } from "vitest";

let template = "";
let headerTemplate = "";
let styles = "";
let localization = "";

beforeAll(async () => {
  [template, headerTemplate, styles, localization] = await Promise.all([
    readFile(
      fileURLToPath(
        new URL("../../../templates/chat/ability-card.hbs", import.meta.url),
      ),
      "utf8",
    ),
    readFile(
      fileURLToPath(
        new URL("../../../templates/chat/chat-card-header.hbs", import.meta.url),
      ),
      "utf8",
    ),
    readFile(
      fileURLToPath(new URL("../../../styles/ability-card.css", import.meta.url)),
      "utf8",
    ),
    readFile(
      fileURLToPath(new URL("../../../lang/pt-BR.json", import.meta.url)),
      "utf8",
    ),
  ]);
});

describe("Ability chat card presentation", () => {
  it("uses the shared chat card header instead of its own icon+name header", () => {
    expect(template).toContain(
      '{{> chatCardHeader title=name subtitle=(localize "ORDEMPARANORMAL2.AbilityCard.Subtitle")}}',
    );
    expect(template).not.toContain("op2-ability-chat-card__header");
    expect(template).not.toContain("op2-ability-chat-card__icon");
    expect(template).not.toContain("op2-ability-chat-card__title");
    expect(headerTemplate).toContain(
      '<h3 class="op2-chat-card__title">{{title}}</h3>',
    );
    expect(localization).toMatch(/"Subtitle":\s*"HABILIDADE"/);
  });

  it("shows the enriched description inside a details disclosure, closed by default", () => {
    expect(template).toMatch(
      /{{#if hasDescription}}[\s\S]*?<details class="op2-ability-chat-card__description">[\s\S]*?{{\/if}}/,
    );
    expect(template).not.toMatch(/<details[^>]*\sopen[^>]*>/);
    expect(template).toContain(
      '<div class="op2-ability-chat-card__description-body">{{{description}}}</div>',
    );
    expect(template).toContain("fa-chevron-down");
    expect(localization).toMatch(/"DescriptionSummary":\s*"Descrição"/);
  });

  it("falls back to a localized empty-description line without a disclosure control", () => {
    expect(template).toMatch(
      /{{#if hasDescription}}[\s\S]*?{{else}}[\s\S]*?ORDEMPARANORMAL2\.AbilityCard\.NoDescription[\s\S]*?{{\/if}}/,
    );
    expect(template).toMatch(
      /{{else}}[\s\S]*?<p class="op2-ability-chat-card__empty">[\s\S]*?ORDEMPARANORMAL2\.AbilityCard\.NoDescription[\s\S]*?<\/p>[\s\S]*?{{\/if}}/,
    );
    expect(localization).toContain('"AbilityCard": {');
    expect(localization).toMatch(
      /"NoDescription":\s*"Esta Habilidade não possui descrição\."/,
    );
  });

  it("scopes its styles to the ability card block and reuses the shared shell tokens", () => {
    expect(styles).toContain(".op2-ability-chat-card {");
    expect(styles).not.toContain(".message-content");
    expect(styles).not.toContain("--op2-ability-card-border");
    expect(styles).not.toContain("--op2-ability-card-bg");
    expect(styles).toContain("var(--op2-check-text)");
    expect(styles).toContain("var(--op2-check-muted)");
  });
});
