import type { ApplicationClosingOptions, ApplicationRenderOptions } from "@client/applications/_types.mjs";
import type { HandlebarsRenderOptions, HandlebarsTemplatePart } from "@client/applications/api/handlebars-application.mjs";
import type FormDataExtended from "@client/applications/ux/form-data-extended.mjs";

import { createAbilityUseId } from "../../adapters/foundry/abilities/create-ability-use-id";
import { deleteAbilityUse, moveAbilityUse, saveExistingAbilityUse, saveNewAbilityUse } from "../../adapters/foundry/abilities/update-ability-uses";
import { ABILITY_COST_SOURCES, normalizeAbilityCost, type AbilityCostSource } from "../../core/abilities/ability-cost";
import { readAbilityResource } from "../../core/abilities/ability-resource";
import { readAbilityUses, type AbilityUseCheckIntegration, type AbilityUseData } from "../../core/abilities/ability-use";
import { AGENT_ATTRIBUTE_KEYS, type AttributeKey } from "../../core/actors/agent-attributes";
import { SKILL_DEFINITIONS, isSkillKey } from "../../config/skills";
import { NORMAL_DIE_STEPS, type NormalDieStep } from "../../core/dice/die-step";

const TEMPLATE = "systems/ordemparanormal2/templates/item/ability-use-editor.hbs";

interface AbilityUseEditorContext {
  readonly tabs?: never;
  readonly abilityUuid: string;
  readonly draft: AbilityUseData;
  readonly enrichedDescription: string;
  readonly sources: readonly { readonly value: AbilityCostSource; readonly labelKey: string; readonly selected: boolean; readonly disabled: boolean }[];
  readonly isNew: boolean;
  readonly hasResource: boolean;
  readonly editable: boolean;
  readonly canMoveUp: boolean;
  readonly canMoveDown: boolean;
  readonly modificationEnabled: boolean;
  readonly applicabilityType: "any" | "attribute" | "skill";
  readonly applicabilityIsAny: boolean;
  readonly applicabilityIsAttribute: boolean;
  readonly applicabilityIsSkill: boolean;
  readonly attributes: readonly { readonly value: AttributeKey; readonly selected: boolean; readonly labelKey: string }[];
  readonly skills: readonly { readonly value: string; readonly label: string; readonly selected: boolean }[];
  readonly dice: readonly { readonly value: NormalDieStep; readonly selected: boolean }[];
}

interface AbilityUseEditorGame {
  readonly packs: {
    get(id: string): { readonly locked: boolean } | undefined;
  };
}

function canEditAbility(ability: foundry.documents.Item): boolean {
  if (!ability.canUserModify(game.user, "update")) return false;
  if (!ability.pack) return true;
  return (game as typeof game & AbilityUseEditorGame).packs.get(ability.pack)?.locked === false;
}

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const { FormDataExtended: FoundryFormDataExtended, TextEditor } = foundry.applications.ux;

export class AbilityUseEditor extends HandlebarsApplicationMixin(ApplicationV2) {
  static override DEFAULT_OPTIONS = {
    actions: {
      cancel: AbilityUseEditor.#onCancel,
      moveDown: AbilityUseEditor.#onMoveDown,
      moveUp: AbilityUseEditor.#onMoveUp,
      remove: AbilityUseEditor.#onRemove,
    },
    classes: ["ordemparanormal2", "ability-use-editor"],
    form: { closeOnSubmit: false, handler: AbilityUseEditor.#onSubmit, submitOnChange: false },
    position: { width: 500, height: 590 },
    tag: "form",
    window: { contentClasses: ["op2-ability-use-editor-content"], resizable: true },
  };

  static override PARTS: Record<string, HandlebarsTemplatePart> = {
    main: { template: TEMPLATE, scrollable: [".op2-ability-use-editor__body"] },
  };

  readonly #ability: foundry.documents.Item;
  readonly #baseline: AbilityUseData | null;
  readonly #onClosed: () => void;
  #draft: AbilityUseData;

  constructor(ability: foundry.documents.Item, use: AbilityUseData | null, onClosed: () => void = () => undefined) {
    super({ window: { title: game.i18n.localize(use ? "ORDEMPARANORMAL2.AbilityUseEditor.Title.Edit" : "ORDEMPARANORMAL2.AbilityUseEditor.Title.Create") } });
    this.#ability = ability;
    this.#baseline = use ? structuredClone(use) : null;
    this.#draft = use ? structuredClone(use) : {
      id: createAbilityUseId(), name: "", description: "",
      cost: { source: "none", amount: 0 }, minimumLevel: null,
      checkIntegration: null,
    };
    this.#onClosed = onClosed;
  }

  #readDraft(formData: FormDataExtended): AbilityUseData | null {
    const object = formData.object;
    const name = typeof object.name === "string" ? object.name.trim() : "";
    const description = typeof object.description === "string" ? object.description : "";
    const source = object.costSource as AbilityCostSource;
    const amount = Number(object.costAmount);
    const rawLevel = object.minimumLevel;
    const minimumLevel = rawLevel === "" || rawLevel === null || rawLevel === undefined ? null : Number(rawLevel);
    if (!name || !ABILITY_COST_SOURCES.includes(source)) return null;
    if (!Number.isInteger(amount) || amount < 0) return null;
    if (minimumLevel !== null && (!Number.isInteger(minimumLevel) || minimumLevel < 1 || minimumLevel > 10)) return null;
    const cost = normalizeAbilityCost(source, amount);
    if (cost.source === "resource" && !readAbilityResource((this.#ability.system as unknown as { readonly resource?: unknown }).resource)) return null;
    let checkIntegration: AbilityUseCheckIntegration | null = null;
    const modificationType = object.modificationType ?? (this.#draft.checkIntegration ? "extraDie" : "none");
    if (modificationType === "extraDie") {
      const die = Number(object.modificationDie);
      if (!NORMAL_DIE_STEPS.includes(die as NormalDieStep)) return null;
      const applicabilityType = object.applicabilityType;
      if (applicabilityType === "any") {
        checkIntegration = { modification: { type: "extraDie", applicability: { type: "any" }, die: die as NormalDieStep } };
      } else if (applicabilityType === "attribute" && AGENT_ATTRIBUTE_KEYS.includes(object.applicabilityAttribute as AttributeKey)) {
        checkIntegration = { modification: { type: "extraDie", applicability: { type: "attribute", attribute: object.applicabilityAttribute as AttributeKey }, die: die as NormalDieStep } };
      } else if (applicabilityType === "skill" && isSkillKey(object.applicabilitySkill) && object.applicabilitySkill !== "aptitude") {
        checkIntegration = { modification: { type: "extraDie", applicability: { type: "skill", skill: object.applicabilitySkill }, die: die as NormalDieStep } };
      } else return null;
    } else if (modificationType !== "none") return null;
    return { ...this.#draft, name, description, cost, minimumLevel, checkIntegration };
  }

  #captureDraft(): boolean {
    const form = this.element;
    if (!(form instanceof HTMLFormElement)) return true;
    const draft = this.#readDraft(new FoundryFormDataExtended(form));
    if (!draft) return false;
    this.#draft = draft;
    return true;
  }

  protected override async _prepareContext(_options: ApplicationRenderOptions & HandlebarsRenderOptions): Promise<AbilityUseEditorContext> {
    const uses = readAbilityUses((this.#ability.system as unknown as { readonly uses?: unknown }).uses);
    const index = uses?.findIndex(({ id }) => id === this.#draft.id) ?? -1;
    const hasResource = readAbilityResource((this.#ability.system as unknown as { readonly resource?: unknown }).resource) !== null;
    const modification = this.#draft.checkIntegration?.modification;
    const applicability = modification?.applicability ?? { type: "any" as const };
    return {
      abilityUuid: this.#ability.uuid,
      draft: this.#draft,
      enrichedDescription: await TextEditor.implementation.enrichHTML(this.#draft.description, { relativeTo: this.#ability, secrets: this.#ability.isOwner }),
      sources: ABILITY_COST_SOURCES.map((source) => ({
        value: source,
        labelKey: `ORDEMPARANORMAL2.AbilitySheet.CostSources.${source}`,
        selected: source === this.#draft.cost.source,
        disabled: source === "resource" && !hasResource,
      })),
      isNew: this.#baseline === null,
      hasResource,
      editable: canEditAbility(this.#ability),
      canMoveUp: index > 0,
      canMoveDown: !!uses && index >= 0 && index < uses.length - 1,
      modificationEnabled: modification?.type === "extraDie",
      applicabilityType: applicability.type,
      applicabilityIsAny: applicability.type === "any",
      applicabilityIsAttribute: applicability.type === "attribute",
      applicabilityIsSkill: applicability.type === "skill",
      attributes: AGENT_ATTRIBUTE_KEYS.map((value) => ({
        value,
        selected: applicability.type === "attribute" && applicability.attribute === value,
        labelKey: `ORDEMPARANORMAL2.AgentSheet.Attributes.${value === "physical" ? "Physical" : value === "mind" ? "Mind" : "Emotion"}`,
      })),
      skills: SKILL_DEFINITIONS.filter((definition) => !("specializations" in definition)).map((definition) => ({
        value: definition.key,
        label: definition.label,
        selected: applicability.type === "skill" && applicability.skill === definition.key,
      })),
      dice: NORMAL_DIE_STEPS.map((value) => ({ value, selected: modification?.die === value })),
    };
  }

  protected override _attachPartListeners(partId: string, htmlElement: HTMLElement, options: HandlebarsRenderOptions): void {
    super._attachPartListeners(partId, htmlElement, options);
    const modification = htmlElement.querySelector<HTMLSelectElement>('[name="modificationType"]');
    const applicability = htmlElement.querySelector<HTMLSelectElement>('[name="applicabilityType"]');
    const integration = htmlElement.querySelector<HTMLFieldSetElement>("[data-check-integration]");
    const attribute = htmlElement.querySelector<HTMLElement>("[data-applicability-attribute]");
    const skill = htmlElement.querySelector<HTMLElement>("[data-applicability-skill]");
    if (!modification || !applicability || !integration || !attribute || !skill) return;
    const update = (): void => {
      integration.hidden = modification.value !== "extraDie";
      attribute.hidden = applicability.value !== "attribute";
      skill.hidden = applicability.value !== "skill";
      for (const field of integration.querySelectorAll<HTMLInputElement | HTMLSelectElement>("input, select")) field.disabled = integration.hidden || !canEditAbility(this.#ability);
      for (const field of attribute.querySelectorAll<HTMLSelectElement>("select")) field.disabled = attribute.hidden || integration.hidden || !canEditAbility(this.#ability);
      for (const field of skill.querySelectorAll<HTMLSelectElement>("select")) field.disabled = skill.hidden || integration.hidden || !canEditAbility(this.#ability);
    };
    modification.addEventListener("change", update);
    applicability.addEventListener("change", update);
    update();
  }

  static async #onSubmit(this: AbilityUseEditor, event: Event, _form: HTMLFormElement, formData: FormDataExtended): Promise<void> {
    event.preventDefault();
    if (!canEditAbility(this.#ability)) return;
    const draft = this.#readDraft(formData);
    if (!draft) {
      ui.notifications.error(game.i18n.localize("ORDEMPARANORMAL2.AbilityUseEditor.Errors.Invalid"));
      return;
    }
    this.#draft = draft;
    const result = this.#baseline
      ? await saveExistingAbilityUse(this.#ability, this.#baseline, draft)
      : await saveNewAbilityUse(this.#ability, draft);
    if (result.status === "updated" || result.status === "unchanged") { await this.close(); return; }
    ui.notifications.error(game.i18n.localize(result.status === "stale" ? "ORDEMPARANORMAL2.AbilityUseEditor.Errors.Stale" : "ORDEMPARANORMAL2.AbilityUseEditor.Errors.SaveFailed"));
    if (result.status === "stale") await this.close();
  }

  static async #onCancel(this: AbilityUseEditor): Promise<void> { await this.close(); }

  async #move(direction: "up" | "down"): Promise<void> {
    if (!canEditAbility(this.#ability) || !this.#baseline || !this.#captureDraft()) return;
    const result = await moveAbilityUse(this.#ability, this.#baseline.id, direction);
    if (result.status === "stale") {
      ui.notifications.error(game.i18n.localize("ORDEMPARANORMAL2.AbilityUseEditor.Errors.Stale"));
      await this.close();
      return;
    }
    if (result.status === "invalid-collection") {
      ui.notifications.error(game.i18n.localize("ORDEMPARANORMAL2.AbilityUseEditor.Errors.SaveFailed"));
      return;
    }
    await this.render({ force: true });
  }

  static async #onMoveUp(this: AbilityUseEditor): Promise<void> { await this.#move("up"); }
  static async #onMoveDown(this: AbilityUseEditor): Promise<void> { await this.#move("down"); }

  static async #onRemove(this: AbilityUseEditor): Promise<void> {
    if (!canEditAbility(this.#ability) || !this.#baseline) return;
    const confirmed = await foundry.applications.api.DialogV2.confirm({
      classes: ["ordemparanormal2"],
      content: `<p>${game.i18n.localize("ORDEMPARANORMAL2.AbilityUseEditor.ConfirmRemove")}</p>`,
      modal: true,
      rejectClose: false,
      window: { title: game.i18n.localize("ORDEMPARANORMAL2.AbilityUseEditor.RemoveTitle") },
    });
    if (!confirmed) return;
    const result = await deleteAbilityUse(this.#ability, this.#baseline.id);
    if (result.status === "updated") { await this.close(); return; }
    ui.notifications.error(game.i18n.localize(result.status === "stale" ? "ORDEMPARANORMAL2.AbilityUseEditor.Errors.Stale" : "ORDEMPARANORMAL2.AbilityUseEditor.Errors.SaveFailed"));
    if (result.status === "stale") await this.close();
  }

  protected override _onClose(options: ApplicationClosingOptions): void {
    super._onClose(options);
    this.#onClosed();
  }
}
