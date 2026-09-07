import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import Handlebars from "handlebars";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  vi.stubGlobal("foundry", {
    applications: {
      api: {
        ApplicationV2: class { constructor(_options?: unknown) {} },
        HandlebarsApplicationMixin: (base: unknown) => base,
      },
    },
  });
});

const requestPoiInvestigationView = vi.fn();
vi.mock("../../adapters/foundry/points-of-interest/poi-investigation-query", () => ({
  requestPoiInvestigationView,
}));

const {
  buildInvestigationRenderContext,
  investigationApplicationKey,
  openInvestigationApplication,
  releaseInvestigationApplication,
} = await import("./investigation-application");

const playerSkills = [{
  key: "perception" as const,
  name: "Percepção",
  information: [
    { visibility: "public" as const, difficulty: 6 },
    { visibility: "hidden" as const },
  ],
}];
const gmSkills = [{
  key: "perception" as const,
  name: "Percepção",
  information: [
    { difficulty: 6, content: "Pista A", showDifficultyToPlayers: true },
    { difficulty: 8, content: "Pista B", showDifficultyToPlayers: false },
  ],
}];
const localize = (key: string) => key;

afterEach(() => vi.clearAllMocks());

describe("buildInvestigationRenderContext", () => {
  it("is a loading state until a result arrives", () => {
    expect(buildInvestigationRenderContext("Sala", null, localize)).toEqual({
      isReady: false, isPlayer: false, isGm: false, name: "Sala", description: "", img: "", skills: [], message: "Loading",
    });
  });

  it("renders name, description and skills when ready", () => {
    const result = { view: { audience: "player" as const, name: "Armário Azul", description: "<p>x</p>", img: "icons/svg/eye.svg", skills: playerSkills } };
    expect(buildInvestigationRenderContext("fallback", result, localize)).toEqual({
      isReady: true,
      isPlayer: true,
      isGm: false,
      name: "Armário Azul",
      description: "<p>x</p>",
      img: "icons/svg/eye.svg",
      skills: [{
        key: "perception",
        name: "Percepção",
        examineLabel: "ExamineWith Percepção",
        informationCount: 2,
        information: [
          { isFirst: true, isHidden: false, difficulty: 6 },
          { isFirst: false, isHidden: true },
        ],
      }],
      message: "",
    });
  });

  it("builds a complete GM context without player-only controls", () => {
    const result = { view: {
      audience: "gm" as const,
      name: "Armário Azul",
      description: "<p>x</p>",
      img: "icons/svg/eye.svg",
      gmContext: "<p>Segredo</p>",
      skills: gmSkills,
    } };
    expect(buildInvestigationRenderContext("fallback", result, localize)).toEqual({
      isReady: true,
      isPlayer: false,
      isGm: true,
      name: "Armário Azul",
      description: "<p>x</p>",
      img: "icons/svg/eye.svg",
      gmContext: "<p>Segredo</p>",
      skills: [{
        key: "perception",
        name: "Percepção",
        informationCount: 2,
        information: [
          { isFirst: true, isDifficultyHidden: false, difficulty: 6, content: "Pista A", revealLabel: "Reveal — Percepção" },
          { isFirst: false, isDifficultyHidden: true, difficulty: 8, content: "Pista B", revealLabel: "Reveal — Percepção" },
        ],
      }],
      message: "",
    });
  });

  it("hands a non-empty description straight through to the context", () => {
    const result = { view: { audience: "player" as const, name: "Armário Azul", description: "<p>Descrição de teste</p>", img: "", skills: playerSkills } };
    expect(buildInvestigationRenderContext("Armário Azul", result, localize).description)
      .toBe("<p>Descrição de teste</p>");
  });

  it("maps error kinds to the right message", () => {
    expect(buildInvestigationRenderContext("S", { error: "no-gm" }, localize).message).toBe("NoGm");
    expect(buildInvestigationRenderContext("S", { error: "unavailable" }, localize).message).toBe("Error");
    expect(buildInvestigationRenderContext("S", { error: "forbidden" }, localize).message).toBe("Error");
    expect(buildInvestigationRenderContext("S", { error: "no-gm" }, localize).isReady).toBe(false);
  });
});

describe("openInvestigationApplication", () => {
  it("keys the Application by Scene + Region", () => {
    expect(investigationApplicationKey("scene1", "region1")).toBe("scene1.region1");
  });

  it("creates one instance per placement and focuses an already-open one", () => {
    const app = { render: vi.fn(), bringToFront: vi.fn() };
    const create = vi.fn(() => app);
    openInvestigationApplication({ sceneId: "s1", regionId: "r1", name: "A" }, create);
    openInvestigationApplication({ sceneId: "s1", regionId: "r1", name: "A" }, create);
    expect(create).toHaveBeenCalledOnce();
    expect(app.render).toHaveBeenCalledExactlyOnceWith({ force: true });
    expect(app.bringToFront).toHaveBeenCalledOnce();
    releaseInvestigationApplication("s1", "r1");
  });

  it("re-opens after the placement is released (on close)", () => {
    const create = vi.fn(() => ({ render: vi.fn(), bringToFront: vi.fn() }));
    openInvestigationApplication({ sceneId: "s2", regionId: "r2", name: "A" }, create);
    releaseInvestigationApplication("s2", "r2");
    openInvestigationApplication({ sceneId: "s2", regionId: "r2", name: "A" }, create);
    expect(create).toHaveBeenCalledTimes(2);
    releaseInvestigationApplication("s2", "r2");
  });
});

describe("investigation-application source and template", () => {
  let source = "";
  let template = "";
  let stylesheet = "";
  beforeAll(async () => {
    [source, template, stylesheet] = await Promise.all([
      readFile(fileURLToPath(new URL("./investigation-application.ts", import.meta.url)), "utf8"),
      readFile(fileURLToPath(new URL("../../../templates/points-of-interest/investigation-application.hbs", import.meta.url)), "utf8"),
      readFile(fileURLToPath(new URL("../../../styles/investigation-application.css", import.meta.url)), "utf8"),
    ]);
  });

  it("delegates resolution and never touches the Item itself", () => {
    expect(source).toContain("requestPoiInvestigationView");
    expect(source).not.toContain("fromUuid");
    expect(source).not.toContain("item.system");
    expect(source).toContain("releaseInvestigationApplication");
  });

  it("loads from _onFirstRender (after the window is rendered) and survives a failure", () => {
    // Kicking the load from _prepareContext races the first render: if it wins,
    // `this.rendered` is still false and the window stays stuck on "Carregando".
    const prepareBody = source.slice(source.indexOf("_prepareContext"), source.indexOf("_onFirstRender"));
    expect(prepareBody).not.toContain("#load(");
    expect(source).toMatch(/_onFirstRender[\s\S]*?void this\.#load\(\)/);
    expect(source).toMatch(/async #load\(\)[\s\S]*?catch \(error\)[\s\S]*?error: "unavailable"/);
  });

  it("uses a four-column grouped grid with role-specific controls", () => {
    expect(template).toContain("{{name}}");
    expect(template).toContain("{{{description}}}");
    expect(template).toContain("{{#each skills}}");
    expect(template).toContain("{{#each information}}");
    expect(template).toContain("{{#if isHidden}}");
    expect(template).toContain("{{#if @root.isGm}}");
    expect(template).toContain("op2-investigation-reveal");
    expect(template).toContain("op2-investigation-examine");
    expect(template).toContain("op2-investigation-gm-context");
    expect(template).toMatch(/role="status"/);
    expect(template).not.toMatch(/<details|chevron|data-action/i);
    expect(template).toContain("disabled");
    expect(template).toContain("aria-describedby");
    expect((template.match(/role="columnheader"/g) ?? [])).toHaveLength(4);
    expect(template).toContain("PointOfInterest.Investigation.Action");
    expect(stylesheet).toContain("--op2-investigation-action-column");
    expect(stylesheet).toMatch(/grid-template-columns:[\s\S]*?skill-column[\s\S]*?action-column[\s\S]*?difficulty-column[\s\S]*?minmax\(0, 1fr\)/);
    expect(stylesheet).toContain("grid-row: span var(--op2-information-count)");
    expect(stylesheet).toMatch(/op2-investigation-skill-cell[\s\S]*?align-items: center;[\s\S]*?text-align: center;/);
  });

  it("opens at natural height with one viewport-limited scroll region", () => {
    expect(source).toContain('position: { width: 820, height: "auto" as const }');
    expect(stylesheet).toContain("max-height: calc(100dvh - 24px)");
    expect(stylesheet).toContain(".op2-investigation-body");
    expect((stylesheet.match(/overflow-y: auto/g) ?? [])).toHaveLength(1);
  });

  it("renders the description as HTML between the name and the skills section", () => {
    const hb = Handlebars.create();
    hb.registerHelper("localize", (key: string) => key);
    const render = hb.compile(template);

    const html = render({
      isReady: true,
      name: "Armário Azul",
      description: "<p>Descrição de teste</p>",
      img: "icons/svg/eye.svg",
      isPlayer: true,
      isGm: false,
      skills: [{
        name: "Percepção",
        examineLabel: "Examinar com Percepção",
        informationCount: 2,
        information: [
          { isFirst: true, isHidden: false, difficulty: 6 },
          { isFirst: false, isHidden: true },
        ],
      }],
      message: "",
    });
    expect(html).toContain("<p>Descrição de teste</p>");
    expect(html.indexOf("Armário Azul")).toBeLessThan(html.indexOf("Descrição de teste"));
    expect(html.indexOf("Descrição de teste")).toBeLessThan(html.indexOf("SkillsHeading"));
    expect(html.match(/<strong>Percepção<\/strong>/g)).toHaveLength(1);
    expect(html).toContain("fa-eye-slash");
    expect(html).toContain("NoInformation");
    expect(html.match(/op2-investigation-row/g)).toHaveLength(2);
    expect(html.match(/op2-investigation-examine/g)).toHaveLength(1);
    expect(html.match(/op2-investigation-action/g)).toHaveLength(1);
    expect(html).toContain("OtherSkill");
    expect(html).not.toContain("op2-investigation-reveal");
    expect(html).not.toContain("op2-investigation-gm-context");

    const gmHtml = render({
      isReady: true,
      isPlayer: false,
      isGm: true,
      name: "Armário Azul",
      description: "",
      img: "",
      gmContext: "<p>Contexto secreto</p>",
      skills: [{
        name: "Percepção",
        informationCount: 2,
        information: [
          { isFirst: true, isDifficultyHidden: false, difficulty: 6, content: "Pista A", revealLabel: "Revelar A" },
          { isFirst: false, isDifficultyHidden: true, difficulty: 8, content: "Pista B", revealLabel: "Revelar B" },
        ],
      }],
      message: "",
    });
    expect(gmHtml.match(/op2-investigation-reveal/g)).toHaveLength(2);
    expect(gmHtml.match(/op2-investigation-action/g)).toHaveLength(2);
    expect(gmHtml).toContain("Pista A");
    expect(gmHtml).toContain("Pista B");
    expect(gmHtml.match(/op2-investigation-gm-hidden-difficulty/g)).toHaveLength(1);
    expect(gmHtml).toContain("HiddenDifficultyToPlayers");
    expect(gmHtml).toContain("Contexto secreto");
    expect(gmHtml).not.toContain("op2-investigation-examine");
    expect(gmHtml).not.toContain("OtherSkill");

    const empty = render({ isReady: true, isPlayer: true, isGm: false, name: "Sala", description: "", img: "", skills: [], message: "" });
    expect(empty).not.toContain("op2-investigation-description");

    const loading = render({ isReady: false, isPlayer: false, isGm: false, name: "Sala", description: "", img: "", skills: [], message: "Carregando…" });
    expect(loading).toContain("Carregando…");
    expect(loading).not.toContain("op2-investigation-description");
  });
});
