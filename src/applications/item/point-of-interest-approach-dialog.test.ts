import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { APTITUDE_OPTIONS } from "./point-of-interest-information-editor";
import { approachFromDraft, changeApproachDraftSkill, selectPoiApproach,
  specializationFieldMarkup } from "./point-of-interest-approach-dialog";

afterEach(() => vi.unstubAllGlobals());

const available = new Set(["acrobatics", "aptitude"] as const);
const localize = (key: string) => key;

describe("Point of Interest approach dialog", () => {
  it("does not render a specialization field for a normal skill", () => {
    expect(specializationFieldMarkup("acrobatics", new Set<string>(), localize)).toBe("");
  });

  it("renders only canonical Aptitude specializations with an unselected required choice", () => {
    const used = new Set(["aptitude:arts"]);
    const markup = specializationFieldMarkup("aptitude", used, localize);
    expect(markup).toContain('data-poi-specialization');
    expect(markup).toContain('name="specialization" required');
    expect(markup).toContain('<option value="" selected disabled>');
    for (const { value } of APTITUDE_OPTIONS) {
      if (value === "arts") expect(markup).not.toContain(`value="${value}"`);
      else expect(markup).toContain(`value="${value}"`);
    }
  });

  it("clears specialization when Aptitude changes to a normal skill", () => {
    const draft = changeApproachDraftSkill({ skill: "aptitude", specialization: "arts" }, "acrobatics");
    expect(draft).toEqual({ skill: "acrobatics", specialization: null });
    expect(specializationFieldMarkup(draft.skill, new Set<string>(), localize)).toBe("");
  });

  it("requires a specialization for Aptitude and never persists one for a normal skill", () => {
    expect(approachFromDraft({ skill: "aptitude", specialization: null }, new Set<string>(), available)).toBeNull();
    expect(approachFromDraft({ skill: "aptitude", specialization: "arts" }, new Set<string>(), available))
      .toMatchObject({ skill: "aptitude", specialization: "arts" });
    expect(approachFromDraft({ skill: "acrobatics", specialization: "arts" }, new Set<string>(), available))
      .toEqual({ skill: "acrobatics", difficulty: 1, showDifficultyToPlayers: false });
  });

  it("updates the rendered fields and confirmation immediately as the skill changes", async () => {
    class FakeSelect {
      readonly handlers = new Map<string, () => void>();
      constructor(readonly name: string, public value: string) {}
      addEventListener(name: string, handler: () => void) { this.handlers.set(name, handler); }
      change(value: string) { this.value = value; this.handlers.get("change")?.(); }
    }
    class FakeContent {
      readonly skill = new FakeSelect("skill", "acrobatics");
      specialization: FakeSelect | null = null;
      specializationMarkup = "";
      onChange: ((event: { target: FakeSelect }) => void) | null = null;
      querySelector(selector: string) {
        if (selector === 'select[name="skill"]') return this.skill;
        if (selector === "[data-poi-specialization]" && this.specialization) {
          return { remove: () => { this.specialization = null; this.specializationMarkup = ""; } };
        }
        return null;
      }
      insertAdjacentHTML(_position: string, markup: string) {
        this.specializationMarkup = markup;
        this.specialization = new FakeSelect("specialization", "");
      }
      addEventListener(_name: string, handler: (event: { target: FakeSelect }) => void) { this.onChange = handler; }
      chooseSpecialization(value: string) {
        if (!this.specialization) throw new Error("Specialization field is missing.");
        this.specialization.value = value;
        this.onChange?.({ target: this.specialization });
      }
    }
    interface DialogConfig {
      content: string;
      render: (event: Event, dialog: unknown) => void;
      ok: { label: string; callback: () => unknown };
      window: { title: string };
    }
    let config: DialogConfig | null = null;
    vi.stubGlobal("HTMLSelectElement", FakeSelect);
    vi.stubGlobal("game", { i18n: { localize } });
    vi.stubGlobal("foundry", { applications: { api: { DialogV2: {
      input: vi.fn(async (value: DialogConfig) => { config = value; return null; }),
    } } } });
    await selectPoiApproach([]);
    if (!config) throw new Error("Dialog was not opened.");
    const options: DialogConfig = config;
    expect(options.content).not.toContain('name="specialization"');
    expect(options.ok.label).toBe("ORDEMPARANORMAL2.PointOfInterestSheet.Actions.AddApproach");
    const content = new FakeContent();
    const add = { disabled: false };
    options.render({} as Event, { element: { querySelector: (selector: string) =>
      selector === ".op2-poi-approach-dialog" ? content : add } });
    expect(add.disabled).toBe(false);
    content.skill.change("aptitude");
    expect(content.specializationMarkup).toContain('name="specialization"');
    expect(add.disabled).toBe(true);
    expect(() => options.ok.callback()).toThrow("Invalid POI approach selection.");
    content.chooseSpecialization("arts");
    expect(add.disabled).toBe(false);
    expect(options.ok.callback()).toMatchObject({ skill: "aptitude", specialization: "arts" });
    content.skill.change("acrobatics");
    expect(content.specialization).toBeNull();
    expect(content.specializationMarkup).toBe("");
    expect(add.disabled).toBe(false);
    expect(options.ok.callback()).toEqual({ skill: "acrobatics", difficulty: 1, showDifficultyToPlayers: false });
  });

  it("uses the requested pt-BR wording in the title, button and field", async () => {
    const language = JSON.parse(await readFile(fileURLToPath(new URL("../../../lang/pt-BR.json", import.meta.url)), "utf8")) as {
      ORDEMPARANORMAL2: { PointOfInterestSheet: { SelectApproachTitle: string;
        ChooseSpecialization: string; Fields: { Specialization: string };
        Actions: { AddApproach: string; RemoveApproach: string } } };
    };
    const labels = language.ORDEMPARANORMAL2.PointOfInterestSheet;
    expect(labels.SelectApproachTitle).toBe("Adicionar forma de descobrir");
    expect(labels.Actions.AddApproach).toBe("Adicionar forma de descobrir");
    expect(labels.Actions.RemoveApproach).toBe("Remover forma de descobrir");
    expect(labels.Fields.Specialization).toBe("Especialização");
    expect(labels.ChooseSpecialization).toBe("Selecione uma especialização");
  });
});
