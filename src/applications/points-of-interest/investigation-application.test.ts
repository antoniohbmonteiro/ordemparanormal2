import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import Handlebars from "handlebars";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const { foundryGlobal, imagePopoutConstructor, imagePopoutRender } = vi.hoisted(() => {
  const imagePopoutConstructor = vi.fn();
  const imagePopoutRender = vi.fn(async () => undefined);
  const foundryGlobal = {
    applications: {
      api: {
        ApplicationV2: class {
          id: string;
          render = vi.fn(async () => this);
          constructor(options?: { id?: string }) { this.id = options?.id ?? "test"; }
          bringToFront(): void {}
          protected async _onFirstRender(): Promise<void> {}
          protected _attachPartListeners(): void {}
          protected _onClose(): void {}
        },
        HandlebarsApplicationMixin: (base: unknown) => base,
      },
      apps: {
        ImagePopout: class {
          render = imagePopoutRender;
          constructor(options: unknown) { imagePopoutConstructor(options); }
        },
      },
    },
  };
  vi.stubGlobal("foundry", foundryGlobal);
  return { foundryGlobal, imagePopoutConstructor, imagePopoutRender };
});

const requestPoiInvestigationView = vi.fn();
const revealPoiInformation = vi.fn();
const resolveInvestigationAgent = vi.fn();
const performAgentCheck = vi.fn();
const selectInvestigationAptitudeSpecialization = vi.fn();
vi.mock("../../adapters/foundry/points-of-interest/poi-investigation-query", () => ({
  requestPoiInvestigationView,
}));
vi.mock("../../adapters/foundry/points-of-interest/reveal-poi-information", () => ({
  revealPoiInformation,
}));
vi.mock("../../adapters/foundry/points-of-interest/resolve-investigation-agent", () => ({
  resolveInvestigationAgent,
}));
vi.mock("../../features/checks/perform-agent-check", () => ({
  performAgentCheck,
}));
vi.mock("./investigation-aptitude-selection", () => ({
  selectInvestigationAptitudeSpecialization,
}));

const {
  buildInvestigationRenderContext,
  InvestigationApplication,
  investigationApplicationKey,
  openInvestigationApplication,
  refreshInvestigationApplication,
  releaseInvestigationApplication,
} = await import("./investigation-application");

const playerSkills = [{
  key: "perception" as const,
  name: "Percepção",
  information: [
    { visibility: "public" as const, difficulty: 6 },
    { visibility: "hidden" as const, content: "Pista revelada" },
  ],
}];
const gmSkills = [{
  key: "perception" as const,
  name: "Percepção",
  information: [
    { id: "a", difficulty: 6, content: "Pista A", showDifficultyToPlayers: true, isRevealed: false },
    { id: "b", difficulty: 8, content: "Pista B", showDifficultyToPlayers: false, isRevealed: true },
  ],
}];
const localize = (key: string) => key;

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  vi.stubGlobal("foundry", foundryGlobal);
});

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
          { isFirst: true, isHidden: false, isRevealed: false, content: "", difficulty: 6 },
          { isFirst: false, isHidden: true, isRevealed: true, content: "Pista revelada" },
        ],
      }],
      message: "",
    });
  });

  it("builds a complete GM context without player-only controls", () => {
    const result = { view: {
      audience: "gm" as const,
      associationItemUuid: "Item.poi",
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
          { id: "a", isFirst: true, isDifficultyHidden: false, isRevealed: false, difficulty: 6, content: "Pista A", revealLabel: "Reveal — Percepção" },
          { id: "b", isFirst: false, isDifficultyHidden: true, isRevealed: true, difficulty: 8, content: "Pista B", revealLabel: "Reveal — Percepção" },
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
    const app = { render: vi.fn(), bringToFront: vi.fn(), refresh: vi.fn() };
    const create = vi.fn(() => app);
    openInvestigationApplication({ sceneId: "s1", regionId: "r1", name: "A" }, create);
    openInvestigationApplication({ sceneId: "s1", regionId: "r1", name: "A" }, create);
    expect(create).toHaveBeenCalledOnce();
    expect(app.render).toHaveBeenCalledExactlyOnceWith({ force: true });
    expect(app.bringToFront).toHaveBeenCalledOnce();
    refreshInvestigationApplication("s1", "r1");
    expect(app.refresh).toHaveBeenCalledOnce();
    releaseInvestigationApplication("s1", "r1");
  });

  it("re-opens after the placement is released (on close)", () => {
    const create = vi.fn(() => ({ render: vi.fn(), bringToFront: vi.fn(), refresh: vi.fn() }));
    openInvestigationApplication({ sceneId: "s2", regionId: "r2", name: "A" }, create);
    releaseInvestigationApplication("s2", "r2");
    openInvestigationApplication({ sceneId: "s2", regionId: "r2", name: "A" }, create);
    expect(create).toHaveBeenCalledTimes(2);
    releaseInvestigationApplication("s2", "r2");
  });
});

describe("InvestigationApplication reveal action", () => {
  it("submits the current GM association and information then refreshes", async () => {
    const view = {
      audience: "gm" as const,
      associationItemUuid: "Item.poi",
      name: "POI",
      description: "",
      img: "",
      gmContext: "",
      skills: gmSkills,
    };
    requestPoiInvestigationView.mockResolvedValue({ view });
    revealPoiInformation.mockResolvedValue({ ok: true, changed: true });
    vi.stubGlobal("game", { i18n: { localize: (key: string) => key } });
    vi.stubGlobal("ui", { notifications: { error: vi.fn() } });
    const app = new InvestigationApplication({ sceneId: "s", regionId: "r", name: "POI" });
    await (app as unknown as { _onFirstRender(a: object, b: object): Promise<void> })
      ._onFirstRender({}, {});
    await vi.waitFor(() => expect(requestPoiInvestigationView).toHaveBeenCalledOnce());

    const button = {
      dataset: { informationId: "a" },
      disabled: false,
      isConnected: true,
      closest: () => button,
      setAttribute: vi.fn(),
      removeAttribute: vi.fn(),
    };
    const action = InvestigationApplication.DEFAULT_OPTIONS.actions.revealInformation;
    await action.call(app, {} as PointerEvent, button as unknown as HTMLElement);

    expect(revealPoiInformation).toHaveBeenCalledExactlyOnceWith({
      sceneId: "s",
      regionId: "r",
      expectedItemUuid: "Item.poi",
      informationId: "a",
    });
    expect(requestPoiInvestigationView).toHaveBeenCalledTimes(2);
    expect(button.disabled).toBe(false);
    expect(button.setAttribute).toHaveBeenCalledWith("aria-busy", "true");
    expect(button.removeAttribute).toHaveBeenCalledWith("aria-busy");
  });
});

describe("InvestigationApplication image action", () => {
  it("opens the projected image in the native ImagePopout", async () => {
    requestPoiInvestigationView.mockResolvedValue({
      view: {
        audience: "player" as const,
        name: "Armário Azul",
        description: "",
        img: "images/poi.webp",
        skills: playerSkills,
      },
    });
    vi.stubGlobal("game", { i18n: { localize: (key: string) => key } });
    const app = new InvestigationApplication({ sceneId: "s", regionId: "r", name: "POI" });
    await (app as unknown as { _onFirstRender(a: object, b: object): Promise<void> })
      ._onFirstRender({}, {});
    await vi.waitFor(() => expect(requestPoiInvestigationView).toHaveBeenCalledOnce());

    await InvestigationApplication.DEFAULT_OPTIONS.actions.enlargeImage.call(app);

    expect(imagePopoutConstructor).toHaveBeenCalledExactlyOnceWith({
      src: "images/poi.webp",
      window: { title: "Armário Azul" },
    });
    expect(imagePopoutRender).toHaveBeenCalledExactlyOnceWith({ force: true });
    expect(requestPoiInvestigationView).toHaveBeenCalledOnce();
  });

  it("does not offer or execute the action without an image", async () => {
    requestPoiInvestigationView.mockResolvedValue({
      view: {
        audience: "player" as const,
        name: "Armário Azul",
        description: "",
        img: "",
        skills: playerSkills,
      },
    });
    vi.stubGlobal("game", { i18n: { localize: (key: string) => key } });
    const app = new InvestigationApplication({ sceneId: "s", regionId: "r", name: "POI" });
    await (app as unknown as { _onFirstRender(a: object, b: object): Promise<void> })
      ._onFirstRender({}, {});
    await vi.waitFor(() => expect(requestPoiInvestigationView).toHaveBeenCalledOnce());

    await InvestigationApplication.DEFAULT_OPTIONS.actions.enlargeImage.call(app);

    expect(imagePopoutConstructor).not.toHaveBeenCalled();
  });

  it("keeps the current broken-image fallback", () => {
    let onError: (() => void) | undefined;
    const image = {
      hidden: false,
      complete: false,
      naturalWidth: 0,
      addEventListener: vi.fn((_event: string, listener: () => void) => { onError = listener; }),
    };
    const element = { querySelector: vi.fn(() => image) };
    const app = new InvestigationApplication({ sceneId: "s", regionId: "r", name: "POI" });

    (app as unknown as { _attachPartListeners(a: string, b: HTMLElement, c: object): void })
      ._attachPartListeners("main", element as unknown as HTMLElement, {});
    onError?.();

    expect(image.hidden).toBe(true);
  });
});

describe("InvestigationApplication examine action", () => {
  const actor = {} as foundry.documents.Actor;
  const playerView = {
    audience: "player" as const,
    name: "POI",
    description: "",
    img: "",
    skills: [
      ...playerSkills,
      { key: "aptitude" as const, name: "Aptidão", information: [
        { visibility: "hidden" as const },
      ] },
    ],
  };

  async function loadedApplication(): Promise<InstanceType<typeof InvestigationApplication>> {
    requestPoiInvestigationView.mockResolvedValue({ view: playerView });
    vi.stubGlobal("game", { i18n: { localize: (key: string) => key } });
    vi.stubGlobal("ui", { notifications: { error: vi.fn() } });
    const app = new InvestigationApplication({ sceneId: "s", regionId: "r", name: "POI" });
    await (app as unknown as { _onFirstRender(a: object, b: object): Promise<void> })
      ._onFirstRender({}, {});
    await vi.waitFor(() => expect(requestPoiInvestigationView).toHaveBeenCalledOnce());
    return app;
  }

  function button(skill: string) {
    const result = {
      dataset: { skill },
      disabled: false,
      isConnected: true,
      closest: () => result,
      setAttribute: vi.fn(),
      removeAttribute: vi.fn(),
    };
    return result;
  }

  it("reuses performAgentCheck with the normal skill selection and no POI DT", async () => {
    resolveInvestigationAgent.mockReturnValue({ ok: true, actor });
    const app = await loadedApplication();
    const target = button("perception");

    await InvestigationApplication.DEFAULT_OPTIONS.actions.examine.call(
      app,
      {} as PointerEvent,
      target as unknown as HTMLElement,
    );

    expect(performAgentCheck).toHaveBeenCalledExactlyOnceWith(actor, {
      kind: "skill",
      key: "perception",
    });
    expect(performAgentCheck.mock.calls[0]?.[1]).not.toHaveProperty("difficulty");
    expect(target.setAttribute).toHaveBeenCalledWith("aria-busy", "true");
    expect(target.disabled).toBe(false);
  });

  it("requires an Aptitude specialization and rolls only after selection", async () => {
    resolveInvestigationAgent.mockReturnValue({ ok: true, actor });
    selectInvestigationAptitudeSpecialization.mockResolvedValue("humanities");
    const app = await loadedApplication();

    await InvestigationApplication.DEFAULT_OPTIONS.actions.examine.call(
      app,
      {} as PointerEvent,
      button("aptitude") as unknown as HTMLElement,
    );

    expect(selectInvestigationAptitudeSpecialization).toHaveBeenCalledOnce();
    expect(performAgentCheck).toHaveBeenCalledExactlyOnceWith(actor, {
      kind: "aptitude",
      key: "humanities",
    });
  });

  it("does not roll when the Aptitude choice is canceled", async () => {
    resolveInvestigationAgent.mockReturnValue({ ok: true, actor });
    selectInvestigationAptitudeSpecialization.mockResolvedValue(null);
    const app = await loadedApplication();

    await InvestigationApplication.DEFAULT_OPTIONS.actions.examine.call(
      app,
      {} as PointerEvent,
      button("aptitude") as unknown as HTMLElement,
    );

    expect(performAgentCheck).not.toHaveBeenCalled();
  });

  it("notifies without starting a check when no Agent can be resolved", async () => {
    resolveInvestigationAgent.mockReturnValue({ ok: false, reason: "none" });
    const app = await loadedApplication();

    await InvestigationApplication.DEFAULT_OPTIONS.actions.examine.call(
      app,
      {} as PointerEvent,
      button("perception") as unknown as HTMLElement,
    );

    expect(performAgentCheck).not.toHaveBeenCalled();
    expect(ui.notifications.error).toHaveBeenCalledWith(
      "ORDEMPARANORMAL2.PointOfInterest.Investigation.NoAgent",
    );
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
    expect(template).not.toMatch(/<details|chevron/i);
    expect(template).toContain('data-action="revealInformation"');
    expect(template).toContain('data-information-id="{{id}}"');
    expect(template).toContain('data-action="examine"');
    expect(template).toContain('data-action="enlargeImage"');
    expect(template).toContain('data-skill="{{../key}}"');
    expect(template).toContain("disabled");
    expect((template.match(/role="columnheader"/g) ?? [])).toHaveLength(4);
    expect(template).toContain("PointOfInterest.Investigation.Action");
    expect(stylesheet).toContain("--op2-investigation-action-column");
    expect(stylesheet).toMatch(/grid-template-columns:[\s\S]*?skill-column[\s\S]*?action-column[\s\S]*?difficulty-column[\s\S]*?minmax\(0, 1fr\)/);
    expect(stylesheet).toContain("grid-row: span var(--op2-information-count)");
    expect(stylesheet).toMatch(/op2-investigation-skill-cell[\s\S]*?align-items: center;[\s\S]*?text-align: center;/);
    expect(template).toContain("op2-investigation-information__content");
    expect(stylesheet).toMatch(/op2-investigation-skill \{[\s\S]*?align-content: start;/);
    expect(stylesheet).toMatch(/op2-investigation-information \{[\s\S]*?place-self: stretch;[\s\S]*?text-align: left;/);
    expect(stylesheet).toMatch(/op2-investigation-information__content \{[\s\S]*?height: auto;[\s\S]*?overflow: visible !important;[\s\S]*?text-overflow: clip !important;[\s\S]*?white-space: pre-wrap !important;[\s\S]*?-webkit-line-clamp: unset !important;/);
    expect(stylesheet).toMatch(/op2-investigation-image img \{[\s\S]*?cursor: zoom-in;/);
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
          { isFirst: true, isHidden: false, isRevealed: false, content: "", difficulty: 6 },
          { isFirst: false, isHidden: true, isRevealed: true, content: "Pista & segura" },
        ],
      }],
      message: "",
    });
    expect(html).toContain("<p>Descrição de teste</p>");
    expect(html).toContain('data-action="enlargeImage"');
    expect(html).toContain('title="ORDEMPARANORMAL2.PointOfInterest.Investigation.EnlargeImage"');
    expect(html.indexOf("Armário Azul")).toBeLessThan(html.indexOf("Descrição de teste"));
    expect(html.indexOf("Descrição de teste")).toBeLessThan(html.indexOf("SkillsHeading"));
    expect(html.match(/<strong>Percepção<\/strong>/g)).toHaveLength(1);
    expect(html).toContain("fa-eye-slash");
    expect(html).toContain("NoInformation");
    expect(html).toContain("Pista &amp; segura");
    expect(html).not.toContain("Pista & segura");
    expect(html).toContain('<div class="op2-investigation-information__content">Pista &amp; segura</div>');
    expect(html.match(/op2-investigation-row/g)).toHaveLength(2);
    expect(html.match(/op2-investigation-examine/g)).toHaveLength(1);
    expect(html).toMatch(/class="op2-investigation-examine" data-action="examine"[^>]*>/);
    expect(html).not.toMatch(/class="op2-investigation-examine"[^>]*disabled/);
    expect(html.match(/op2-investigation-action/g)).toHaveLength(1);
    expect(html).toContain("OtherSkill");
    expect(html).toMatch(/class="op2-investigation-other" disabled/);
    expect(html).not.toContain("op2-investigation-reveal");
    expect(html).not.toContain("op2-investigation-gm-context");

    const gmHtml = render({
      isReady: true,
      isPlayer: false,
      isGm: true,
      associationItemUuid: "Item.poi",
      name: "Armário Azul",
      description: "",
      img: "",
      gmContext: "<p>Contexto secreto</p>",
      skills: [{
        name: "Percepção",
        informationCount: 2,
        information: [
          { id: "a", isFirst: true, isDifficultyHidden: false, isRevealed: false, difficulty: 6, content: "Pista A", revealLabel: "Revelar A" },
          { id: "b", isFirst: false, isDifficultyHidden: true, isRevealed: true, difficulty: 8, content: "Pista B", revealLabel: "Revelar B" },
        ],
      }],
      message: "",
    });
    expect(gmHtml.match(/class="op2-investigation-reveal"/g)).toHaveLength(1);
    expect(gmHtml.match(/class="op2-investigation-revealed"/g)).toHaveLength(1);
    expect(gmHtml).toContain("Revealed");
    expect(gmHtml.match(/op2-investigation-action/g)).toHaveLength(2);
    expect(gmHtml).toContain("Pista A");
    expect(gmHtml).toContain("Pista B");
    expect(gmHtml).toContain('<div class="op2-investigation-information__content">Pista A</div>');
    expect(gmHtml.match(/op2-investigation-gm-hidden-difficulty/g)).toHaveLength(1);
    expect(gmHtml).toContain("HiddenDifficultyToPlayers");
    expect(gmHtml).toContain("Contexto secreto");
    expect(gmHtml).not.toContain("op2-investigation-examine");
    expect(gmHtml).not.toContain("OtherSkill");

    const empty = render({ isReady: true, isPlayer: true, isGm: false, name: "Sala", description: "", img: "", skills: [], message: "" });
    expect(empty).not.toContain("op2-investigation-description");
    expect(empty).not.toContain('data-action="enlargeImage"');

    const loading = render({ isReady: false, isPlayer: false, isGm: false, name: "Sala", description: "", img: "", skills: [], message: "Carregando…" });
    expect(loading).toContain("Carregando…");
    expect(loading).not.toContain("op2-investigation-description");
  });
});
