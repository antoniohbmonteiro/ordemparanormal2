import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { beforeAll, describe, expect, it } from "vitest";

let template = "";
let headerTemplate = "";
let shellTemplate = "";
let checkStyles = "";
let shellStyles = "";
let headerStyles = "";
let styles = "";
let localization = "";

beforeAll(async () => {
  [template, headerTemplate, shellTemplate, checkStyles, shellStyles, headerStyles, localization] =
    await Promise.all([
      readFile(
        fileURLToPath(
          new URL("../../../templates/chat/check-card.hbs", import.meta.url),
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
        fileURLToPath(
          new URL("../../../templates/chat/chat-message-shell.hbs", import.meta.url),
        ),
        "utf8",
      ),
      readFile(
        fileURLToPath(
          new URL("../../../styles/check-card.css", import.meta.url),
        ),
        "utf8",
      ),
      readFile(
        fileURLToPath(
          new URL("../../../styles/chat-message-shell.css", import.meta.url),
        ),
        "utf8",
      ),
      readFile(
        fileURLToPath(
          new URL("../../../styles/chat-card-header.css", import.meta.url),
        ),
        "utf8",
      ),
      readFile(fileURLToPath(new URL("../../../lang/pt-BR.json", import.meta.url)), "utf8"),
    ]);
  styles = `${checkStyles}\n${shellStyles}\n${headerStyles}`;
});

describe("Check Chat Card presentation", () => {
  it("uses the contributing formula as the only native disclosure control", () => {
    expect(template).toContain('<details class="op2-check-card__breakdown">');
    expect(template).toMatch(
      /<summary[\s\S]*?{{contributingFormula}}[\s\S]*?fa-chevron-down[\s\S]*?<\/summary>/,
    );
    expect(template.match(/fa-chevron-down/g)).toHaveLength(1);
  });

  it("keeps excluded dice as opacity-only row metadata", () => {
    expect(template).toContain("op2-check-card__die--excluded");
    expect(checkStyles).toContain(".op2-check-card__die--excluded");
    expect(checkStyles).not.toContain("text-decoration");
    expect(template).not.toContain("não somado");
    expect(template).not.toContain("descartado");
  });

  it("keeps fixed-time metadata independent from Foundry message internals", () => {
    expect(shellTemplate).toContain("op2-chat-message__metadata");
    expect(shellTemplate).toMatch(
      /{{#if metadata}}[\s\S]*?{{metadata}}[\s\S]*?{{#if canDelete}}/,
    );
    expect(shellTemplate).not.toMatch(/ago|atrás|message-timestamp/);
    expect(`${shellTemplate}\n${styles}`).not.toMatch(
      /\.message-content|\.message-header/,
    );
  });

  it("renders localized critical text directly below Total", () => {
    expect(template).toContain("op2-check-card__result--critical-positive");
    expect(template).toContain("op2-check-card__result--critical-failure");
    expect(template).toMatch(
      /op2-check-card__total[\s\S]*?{{#if rollAnalysis\.isPositiveCritical}}[\s\S]*?op2-check-card__critical-label--positive[\s\S]*?ORDEMPARANORMAL2\.CheckCard\.PositiveCritical[\s\S]*?{{\/if}}/,
    );
    expect(template).toMatch(
      /{{#if rollAnalysis\.isCriticalFailure}}[\s\S]*?op2-check-card__critical-label--failure[\s\S]*?ORDEMPARANORMAL2\.CheckCard\.CriticalFailure[\s\S]*?{{\/if}}[\s\S]*?{{#if resolution}}/,
    );
    expect(localization).toMatch(/"PositiveCritical":\s*"CRÍTICO"/);
    expect(localization).toMatch(/"CriticalFailure":\s*"FALHA CRÍTICA"/);
  });

  it("uses distinct critical colors for text and the existing Total motif", () => {
    expect(shellStyles).toContain("--op2-check-critical-positive: #b58b68;");
    expect(shellStyles).toContain("--op2-check-critical-failure: #dc6870;");
    expect(checkStyles).toContain("rgba(181, 139, 104, 0.88)");
    expect(checkStyles).toContain("rgba(220, 104, 112, 0.9)");
    expect(checkStyles).toMatch(
      /\.op2-check-card__critical-label\s*{[^}]*font-weight:\s*800;/,
    );
    expect(checkStyles).not.toMatch(
      /\.op2-check-card__critical-label\s*{[^}]*border:/,
    );
  });

  it("keeps portrait, accessible speaker name, and deletion in the reusable shell", () => {
    expect(template).not.toContain("actorPortrait");
    expect(template).not.toContain("op2-check-card__portrait");
    expect(headerTemplate).not.toContain("portrait");
    expect(shellTemplate).toContain("op2-chat-message__portrait");
    expect(shellTemplate).toContain('aria-label="{{speakerName}}"');
    expect(shellTemplate).toContain("{{{content}}}");
    expect(shellTemplate).toContain("{{#if canDelete}}");
    expect(shellTemplate).toContain('data-action="delete-message"');
  });

  it("renders the portrait only when there is an Actor, with a tooltip of the Actor's own name", () => {
    expect(shellTemplate).toMatch(
      /{{#if portrait}}[\s\S]*?op2-chat-message__portrait[\s\S]*?{{\/if}}/,
    );
    expect(shellTemplate).toContain('title="{{portrait.name}}"');
    expect(shellTemplate).toContain("op2-chat-message__shell--no-portrait");
    expect(shellTemplate).not.toContain('title="{{actorName}}"');
    expect(shellTemplate).not.toContain('title="{{speakerName}}"');
  });

  it("shows a shared header with title and optional subtitle via the reusable partial", () => {
    expect(template).toContain("{{> chatCardHeader title=name subtitle=subtitle}}");
    expect(template).not.toContain("op2-check-card__header");
    expect(headerTemplate).toContain(
      '<h3 class="op2-chat-card__title">{{title}}</h3>',
    );
    expect(headerTemplate).toMatch(
      /{{#if subtitle}}[\s\S]*?op2-chat-card__subtitle[\s\S]*?{{\/if}}/,
    );
    expect(headerTemplate).not.toMatch(
      /check result|DT|crítico|description|cost|resource/i,
    );
  });

  it("adds Portuguese tooltips to the RA/RB abbreviations without changing their visible text", () => {
    expect(template).toContain(
      "title=\"{{localize 'ORDEMPARANORMAL2.CheckCard.HighestResultTooltip'}}\"",
    );
    expect(template).toContain(
      "title=\"{{localize 'ORDEMPARANORMAL2.CheckCard.LowestResultTooltip'}}\"",
    );
    expect(template).toContain(
      '{{localize "ORDEMPARANORMAL2.CheckCard.HighestResult"}}',
    );
    expect(template).toContain(
      '{{localize "ORDEMPARANORMAL2.CheckCard.LowestResult"}}',
    );
    expect(localization).toMatch(/"HighestResult":\s*"RA"/);
    expect(localization).toMatch(/"LowestResult":\s*"RB"/);
    expect(localization).toMatch(/"HighestResultTooltip":\s*"Rolagem Alta"/);
    expect(localization).toMatch(/"LowestResultTooltip":\s*"Rolagem Baixa"/);
  });

  it("centers the unchanged portrait against the real header height", () => {
    expect(shellStyles).toContain("--op2-check-header-height: 3.5rem;");
    expect(shellStyles).toMatch(
      /\.op2-chat-message__portrait\s*{[\s\S]*?top:\s*calc\(var\(--op2-check-header-height\) \/ 2\);[\s\S]*?transform:\s*translateY\(-50%\);/,
    );
    expect(headerStyles).toMatch(
      /\.op2-chat-card__header\s*{[\s\S]*?min-height:\s*var\(--op2-check-header-height\);/,
    );
    expect(shellStyles).toContain("width: 2.7rem;");
    expect(shellStyles).toContain("height: 2.7rem;");
  });

  it("scopes native root neutralization to the explicit OP2 root class", () => {
    expect(shellStyles).toContain(".op2-chat-message {");
    expect(styles).not.toContain(".chat-message");
    expect(styles).not.toContain(".message-content");
    expect(styles).not.toContain(".message-header");
  });

  it("defines the historical accent only on the shell and derives decoration", () => {
    expect(shellStyles.match(/--op2-check-accent:/g)).toHaveLength(1);
    expect(shellStyles).toContain("--op2-check-accent: #e53935;");
    expect(shellStyles).toContain("--op2-check-accent-bright: color-mix(");
    expect(headerStyles).toContain("color: var(--op2-check-accent-bright);");
    expect(checkStyles).toContain(".op2-check-card__outcome--success");
    expect(checkStyles).toContain("color: #64c968;");
    expect(checkStyles).toContain(".op2-check-card__outcome--failure");
    expect(checkStyles).toContain("color: #ef5350;");
  });

  it("gives the TEXT tier a real header row (shared partial) instead of a corner sender badge", () => {
    expect(shellTemplate).not.toContain("op2-chat-message__sender");
    expect(shellTemplate).toMatch(
      /{{#if header}}[\s\S]*?{{> chatCardHeader title=header\.title subtitle=header\.subtitle}}[\s\S]*?{{\/if}}/,
    );
    expect(shellTemplate.indexOf("{{#if header}}")).toBeLessThan(
      shellTemplate.indexOf("op2-chat-message__content"),
    );
  });

  it("centers one natural result composition with or without resolution", () => {
    expect(template).toContain("op2-check-card__result-composition");
    expect(template).toMatch(
      /op2-check-card__result-composition[\s\S]*?op2-check-card__total[\s\S]*?{{#if resolution}}[\s\S]*?op2-check-card__outcome[\s\S]*?{{\/if}}[\s\S]*?op2-check-card__roll-analysis/,
    );
    expect(checkStyles).toMatch(
      /\.op2-check-card__result\s*{[\s\S]*?display:\s*grid;[\s\S]*?place-items:\s*center;/,
    );
    expect(checkStyles).toMatch(
      /\.op2-check-card__result-composition\s*{[\s\S]*?justify-content:\s*center;/,
    );
    expect(checkStyles).not.toContain(".no-dt");
    expect(checkStyles).not.toMatch(
      /\.op2-check-card__roll-analysis\s*{[^}]*margin-top:\s*auto;/,
    );
  });
});
