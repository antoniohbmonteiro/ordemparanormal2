import type { ApplicationClosingOptions } from "@client/applications/_types.mjs";
import { addCustomSkill, pickActorSkill } from "./custom-skills";
import { actorCustomSkills, updateActorCustomSkill } from "../../adapters/foundry/actors/actor-custom-skills";
import { canManageCustomSkills, subscribeCustomSkills, worldCustomSkillOptions } from "../../adapters/foundry/actors/custom-skill-catalog";
import { isCustomSkillKey, readSkillDie } from "../../core/actors/custom-skills";
import type { DocumentSheetRenderContext, DocumentSheetRenderOptions } from "@client/applications/api/document-sheet.mjs";
import type { HandlebarsRenderOptions, HandlebarsTemplatePart } from "@client/applications/api/handlebars-application.mjs";
import type ContextMenu from "@client/applications/ux/context-menu.mjs";
import { canUserRollActor } from "../../adapters/foundry/actors/agent-check-permission";
import { createAbilitySnapshot, readOwnedAbilitySourceUuid } from "../../adapters/foundry/abilities/ability-sources";
import { hasLegacyThreatOverride, readLegacyThreatEntry } from "../../adapters/foundry/abilities/legacy-threat-entry";
import { collectOwnedAbilities } from "../../adapters/foundry/abilities/owned-abilities";
import { adjustOwnedAbilityResource } from "../../adapters/foundry/abilities/adjust-owned-ability-resource";
import { enqueueActorAbilityCostOperation } from "../../adapters/foundry/abilities/ability-use-cost-payment";
import { loadAvailableSingleItems, resolveSingleItemCatalogSource } from "../../adapters/foundry/items/single-item-catalog";
import { ACTOR_CHECK_SKILLS, parseActorCheckSelection } from "../../application/checks/build-actor-check";
import { SKILL_DIE_STEPS } from "../../config/skills";
import { ABILITY_ITEM_TYPE } from "../../config/system-config";
import { AGENT_ATTRIBUTE_KEYS } from "../../core/actors/agent-attributes";
import { isDieStep } from "../../core/dice/die-step";
import {
  THREAT_TRAIT_TEXTS, ThreatDataModel, threatSkillKey,
} from "../../documents/actor/threat-data-model";
import { executeAbilityForm } from "../../features/abilities/execute-ability-form";
import { performThreatCheck, type ThreatCheckIntent } from "../../features/checks/perform-threat-check";
import { buildThreatSheetViewModel, THREAT_I18N } from "../../ui/actor/threat-sheet-view-model";
import { bindAbilityCardMenu, openAbilityCardMenu } from "./ability-card-menu";
import {
  editThreatFields, localizeThreat, readThreatText, THREAT_TEMPLATE_ROOT,
} from "./threat-editor";

const { ActorSheetV2 } = foundry.applications.sheets as unknown as FoundryApplicationSheetsWithActorSheetV2;
const { DialogV2, HandlebarsApplicationMixin } = foundry.applications.api;
const TEMPLATE_PARTIALS = ["portrait", "resource-fields", "attribute-card", "skill-row", "content-tabs", "die-step-select", "ability-cards", "threat-ability-use", "add-skill-button"];
const ABILITY_CATALOG = {
  itemType: ABILITY_ITEM_TYPE,
  worldLabelKey: "ORDEMPARANORMAL2.Common.World",
  unavailableSourceMessage: "The selected Ability source is unavailable.",
};
type ThreatItems = Iterable<foundry.documents.Item> & { get(id: string): foundry.documents.Item | undefined };
const ACTIONS = [
  "selectThreatTab", "toggleEditMode", "toggleSkillSearch", "manageSkills",
  "addElement", "removeElement", "addSkill", "removeSkill", "addCondition", "removeCondition",
  "toggleAbilityDescription", "editTrait", "rollCheck", "openAbilityMenu",
  "createAbility", "addExistingAbility", "useAbilityForm", "increaseAbilityResource", "decreaseAbilityResource",
] as const;

export class ThreatSheet extends HandlebarsApplicationMixin(ActorSheetV2) {
  static override DEFAULT_OPTIONS = {
    classes: ["ordemparanormal2", "threat-sheet"],
    actions: Object.fromEntries(ACTIONS.map((action) => [action, ThreatSheet.#onAction])),
    form: { handler: () => undefined, closeOnSubmit: false, submitOnChange: false },
    position: { width: 850, height: 820 },
    window: { contentClasses: ["op2-threat-sheet-content"], resizable: true },
  };

  static override TABS = {
    content: {
      tabs: [
        { id: "abilities", label: "ORDEMPARANORMAL2.AgentSheet.Tabs.Abilities" },
        { id: "notes", label: "ORDEMPARANORMAL2.AgentSheet.Tabs.Notes" },
      ],
      initial: "abilities",
    },
  };

  static override PARTS: Record<string, HandlebarsTemplatePart> = {
    main: {
      template: `${THREAT_TEMPLATE_ROOT}/threat-sheet.hbs`,
      templates: [
        ...TEMPLATE_PARTIALS.map((partial) => `${THREAT_TEMPLATE_ROOT}/partials/${partial}.hbs`),
        ...["properties", "notes"].map((part) => `${THREAT_TEMPLATE_ROOT}/threat-sheet-${part}.hbs`),
      ],
      scrollable: [".op2-threat-content", ".op2-threat-layout__side", ".op2-threat-layout"],
    },
  };

  #editMode = false;
  #showSearch = false;
  #search = "";
  #rollInFlight = false;
  #pendingUpdate: Promise<void> = Promise.resolve();
  readonly #copyingAbilitySources = new Set<string>();
  readonly #expanded = new Set<string>();
  #abilityMenu: ContextMenu | null = null;
  #propertiesOpen = false;
  #customSkillPicker?: AbortController;
  #unsubscribeCustomSkills?: () => void;

  get #actor(): foundry.documents.Actor {
    return this.document as foundry.documents.Actor;
  }

  get #system(): ThreatDataModel {
    const system = this.#actor.system;
    if (!(system instanceof ThreatDataModel)) throw new Error("Invalid Threat DataModel.");
    return system;
  }

  get #canEdit(): boolean {
    return this.isEditable && this.#actor.canUserModify(game.user, "update");
  }

  override get title(): string {
    return game.i18n.format(`${THREAT_I18N}.Title`, { name: this.#actor.name });
  }

  protected override async _prepareContext(options: DocumentSheetRenderOptions & HandlebarsRenderOptions) {
    const canViewNotes = game.user?.role === CONST.USER_ROLES.GAMEMASTER;
    if (this.tabGroups.content === "notes" && !canViewNotes) this.tabGroups.content = "abilities";
    const context = (await super._prepareContext(options)) as DocumentSheetRenderContext<foundry.documents.Actor>;
    const { notes, ...publicTabs } = this._prepareTabs("content");
    const converted = new Set<string>();
    const token = this.#actor.token;
    const visibleItems = [...this.#items].filter((item) => {
      const entry = readLegacyThreatEntry(item);
      if (!entry) return true;
      if (token && entry.owner === token.baseActor?.uuid && hasLegacyThreatOverride(token, entry.section)) return false;
      converted.add(`${entry.section}:${entry.id}`);
      return true;
    });
    const abilities = await Promise.all(collectOwnedAbilities(visibleItems).map(async (ability) => {
      const item = this.#items.get(ability.id);
      if (!item) return ability;
      const enrich = (html: string) => foundry.applications.ux.TextEditor.implementation.enrichHTML(html, {
        relativeTo: item, secrets: item.isOwner,
      });
      const [descriptionHTML, uses] = await Promise.all([
        enrich(ability.description),
        Promise.all(ability.useCollection.uses.map(async (use) => [use.id, await enrich(use.description)] as const)),
      ]);
      return { ...ability, descriptionHTML, useDescriptions: new Map(uses) };
    }));
    const canEditStructure = this.#canEdit && this.#editMode;
    const canRoll = canUserRollActor(this.#actor, game.user);
    const customSkillOptions = worldCustomSkillOptions();
    const threat = buildThreatSheetViewModel(this.#system, (key) => game.i18n.localize(key), this.id, this.#expanded, abilities, converted, canRoll, canEditStructure, customSkillOptions);
    return {
      ...context,
      applicationId: this.id,
      name: this.#actor.name,
      portrait: this.#actor.img,
      editable: this.#canEdit,
      canEditStructure,
      canRoll,
      canAddSkill: this.#system.skills.length < ACTOR_CHECK_SKILLS.length || canManageCustomSkills()
        || customSkillOptions.some(option => !option.archived && !readSkillDie(actorCustomSkills(this.#actor)[option.key])),
      editMode: this.#editMode,
      tabs: canViewNotes ? { ...publicTabs, notes } : publicTabs,
      propertiesOpen: this.#propertiesOpen,
      showSearch: this.#showSearch,
      search: this.#search,
      threat: {
        ...threat,
        traitTexts: canEditStructure ? threat.traitTexts : threat.traitTexts.filter(({ value }) => value.trim()),
      },
    };
  }

  protected override async _preRender(context: object, options: DocumentSheetRenderOptions & HandlebarsRenderOptions): Promise<void> {
    this.#unsubscribeCustomSkills ??= subscribeCustomSkills(() => { if (this.rendered) void this.render(); });
    await super._preRender(context, options);
    await this.#clearAbilityMenu();
  }

  async #clearAbilityMenu(): Promise<void> {
    const menu = this.#abilityMenu;
    this.#abilityMenu = null;
    if (menu?.element?.isConnected) await menu.close({ animate: false });
  }

  protected override _attachPartListeners(partId: string, htmlElement: HTMLElement, options: HandlebarsRenderOptions): void {
    super._attachPartListeners(partId, htmlElement, options);
    if (this.#canEdit && this.#editMode) {
      this.#abilityMenu = bindAbilityCardMenu(
        htmlElement,
        () => this.#canEdit && this.#editMode,
        (target) => this.#ability(target.dataset.itemId ?? "")?.sheet?.render(true),
        async (target) => {
          try {
            const item = this.#ability(target.dataset.itemId ?? "");
            if (item?.id && await this.#confirmRemoval() && this.#canEdit && this.#editMode && this.#ability(item.id) === item) {
              await item.delete();
              this.#expanded.delete(item.id);
            }
          } catch (error) {
            ThreatSheet.#reportError(error);
          }
        },
      );
    }
    const properties = htmlElement.querySelector<HTMLDetailsElement>("[data-threat-properties]");
    properties?.addEventListener("toggle", () => { this.#propertiesOpen = properties.open; });
    const portrait = htmlElement.querySelector<HTMLImageElement>('img[data-edit="img"]');
    htmlElement.querySelector("[data-portrait-trigger]")?.addEventListener("click", () => portrait?.click());
    const search = htmlElement.querySelector<HTMLInputElement>("[data-skill-search]");
    const filterSkills = () => {
      if (search) this.#search = search.value;
      const normalize = (value: string) => value.toLocaleLowerCase("pt-BR").normalize("NFD").replace(/\p{M}/gu, "");
      const query = normalize(this.#search.trim());
      const rows = [...htmlElement.querySelectorAll<HTMLElement>("[data-skill-search-text]")];
      for (const row of rows) row.hidden = !normalize(row.dataset.skillSearchText ?? "").includes(query);
      const empty = htmlElement.querySelector<HTMLElement>("[data-skill-search-empty]");
      if (empty) empty.hidden = !query || rows.some((row) => !row.hidden);
    };
    search?.addEventListener("input", filterSkills);
    filterSkills();
    htmlElement.addEventListener("change", (event) => {
      const field = event.target;
      if (field instanceof HTMLInputElement || field instanceof HTMLSelectElement) {
        void this.#updateField(field).catch((error: unknown) => ThreatSheet.#reportError(error));
      }
    });
    htmlElement.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" || !(event.target instanceof HTMLInputElement)) return;
      event.preventDefault();
      if (event.target.name) event.target.blur();
    });
  }

  protected override async _preClose(options: ApplicationClosingOptions): Promise<void> {
    this.#customSkillPicker?.abort();
    this.#unsubscribeCustomSkills?.();
    this.#unsubscribeCustomSkills = undefined;
    await this.#pendingUpdate;
    await this.#clearAbilityMenu();
    await super._preClose(options);
  }

  static #reportError(error: unknown): void {
    console.error("Threat sheet operation failed.", error);
    ui.notifications.error(localizeThreat("OperationFailed"));
  }

  static async #onAction(this: ThreatSheet, event: PointerEvent, target: HTMLElement): Promise<void> {
    try {
      await this.#dispatch(event, target);
    } catch (error) {
      ThreatSheet.#reportError(error);
    }
  }

  async #dispatch(event: PointerEvent, target: HTMLElement): Promise<void> {
    const { action, tab, entryId, field, checkKind, checkKey, useId, itemId } = target.dataset;
    switch (action) {
      case "selectThreatTab": {
        if (tab === "abilities" || (tab === "notes" && game.user?.role === CONST.USER_ROLES.GAMEMASTER)) {
          await this.#pendingUpdate;
          this.changeTab(tab, "content", { event, navElement: target, force: true, updatePosition: false });
          await this.render({ force: true });
        }
        return;
      }
      case "toggleEditMode":
      case "manageSkills":
        if (this.#canEdit) {
          this.#editMode = !this.#editMode;
          if (!this.#editMode) this.#customSkillPicker?.abort();
          await this.render({ force: true });
        }
        return;
      case "toggleSkillSearch":
        this.#showSearch = !this.#showSearch;
        if (!this.#showSearch) this.#search = "";
        await this.render({ force: true });
        this.element.querySelector<HTMLInputElement>("[data-skill-search]")?.focus();
        return;
      case "toggleAbilityDescription":
        {
          const id = target.dataset.abilityId ?? itemId;
          if (!id) return;
          if (!this.#expanded.delete(id)) this.#expanded.add(id);
          await this.render({ force: true });
          const trigger = [...this.element.querySelectorAll<HTMLButtonElement>('button[data-action="toggleAbilityDescription"]')]
            .find((button) => (button.dataset.abilityId ?? button.dataset.itemId) === id && button.className === target.className);
          trigger?.focus();
        }
        return;
      case "rollCheck": {
        const intent = checkKind === "action" && entryId ? { kind: "action" as const, id: entryId }
          : parseActorCheckSelection(checkKind ?? "", checkKey ?? "");
        if (intent) await this.#roll(intent);
        return;
      }
      case "addCondition":
        if (this.#canEdit) await this.#addCondition();
        return;
      case "removeCondition":
        if (entryId) await this.#update((system) => ({
          "system.conditions": system.conditions.filter(({ id }) => id !== entryId),
        }));
        return;
      case "editTrait":
        if (field && this.#canEdit && this.#editMode) await this.#editCharacteristic(field);
        return;
      case "useAbilityForm":
        if (itemId && useId) await this.#useAbilityForm(itemId, useId);
        return;
      case "increaseAbilityResource":
      case "decreaseAbilityResource":
        if (itemId && this.#canEdit) {
          await enqueueActorAbilityCostOperation(this.#actor, async () => {
            if (!this.#canEdit) return;
            const result = await adjustOwnedAbilityResource(this.#actor, itemId, action === "increaseAbilityResource" ? 1 : -1);
            if (result.status === "updated") await this.render({ force: true });
          });
        }
        return;
    }
    if (!this.#canEdit || !this.#editMode) return;
    switch (action) {
      case "addElement": await this.#addElement(); break;
      case "removeElement":
        await this.#update((system) => ({ "system.elements": system.elements.filter((element) => element !== entryId) }));
        break;
      case "addSkill": await this.#addSkill(); break;
      case "removeSkill": if (entryId) await this.#removeSkill(entryId); break;
      case "createAbility": await this.#createAbility(); break;
      case "addExistingAbility": await this.#addExistingAbility(); break;
      case "openAbilityMenu":
        if (this.#abilityMenu) openAbilityCardMenu(event, target, (id) => !!this.#ability(id));
        break;
    }
  }

  protected override _toggleDisabled(disabled: boolean): void {
    super._toggleDisabled(disabled);
    if (!disabled) return;
    for (const button of this.element.querySelectorAll<HTMLButtonElement>(
      'button[data-action="selectThreatTab"], button[data-action="toggleAbilityDescription"]',
    )) button.disabled = false;
  }

  #update(build: (system: ThreatDataModel) => Record<string, unknown> | undefined): Promise<void> {
    const update = this.#pendingUpdate.then(async () => {
      if (!this.#canEdit) return;
      const patch = build(this.#system);
      if (patch) {
        const updated = await this.#actor.update(patch);
        if (!updated) throw new Error("The threat update was not confirmed.");
      }
    });
    this.#pendingUpdate = update.catch(() => undefined);
    return update;
  }

  async #updateField(field: HTMLInputElement | HTMLSelectElement): Promise<void> {
    if (!this.#canEdit) return;
    const { name, value } = field;
    const isHealth = name === "system.resources.health.value" || name === "system.resources.health.max";
    if ((isHealth || name === "system.damageReduction") && field instanceof HTMLInputElement) {
      const number = name === "system.damageReduction" && value.trim() === "" ? null : field.valueAsNumber;
      if (number !== null && (!Number.isSafeInteger(number) || number < 0)) {
        ui.notifications.warn(localizeThreat("InvalidNumber"));
        await this.render({ force: true });
        return;
      }
      await this.#update(() => ({ [name]: number }));
      return;
    }
    if (!this.#editMode) return;
    if (name === "name" || name === "system.category") {
      const text = value.trim();
      if (name === "name" && !text) {
        await this.render({ force: true });
        return;
      }
      await this.#update(() => ({ [name]: text }));
      return;
    }
    const die = Number(value);
    if (AGENT_ATTRIBUTE_KEYS.some((key) => name === `system.attributes.${key}`) && isDieStep(die)) {
      await this.#update(() => ({ [name]: die }));
      return;
    }
    const skillDie = SKILL_DIE_STEPS.find((step) => step === die);
    const customKey = name.startsWith("system.customSkills.") ? name.slice("system.customSkills.".length) : undefined;
    if (isCustomSkillKey(customKey) && skillDie !== undefined) {
      await updateActorCustomSkill(this.#actor, customKey, skillDie, "edit", () => this.#canEdit && this.#editMode);
      return;
    }
    if (name.startsWith("skill:") && skillDie !== undefined) {
      await this.#update((system) => ({
        "system.skills": system.skills.map((skill) =>
          `skill:${threatSkillKey(skill)}` === name ? { ...skill, die: skillDie } : skill),
      }));
    }
  }

  async #confirmRemoval(): Promise<boolean> {
    return Boolean(await DialogV2.confirm({
      window: { title: localizeThreat("Remove") },
      content: localizeThreat("ConfirmRemoval"),
      rejectClose: false,
    }));
  }

  async #addElement(): Promise<void> {
    const value = await editThreatFields(localizeThreat("AddElement"), [{
      name: "element", label: localizeThreat("Element"), value: "", required: true,
      suggestions: [localizeThreat("ElementDeath"), localizeThreat("ElementFear")],
    }], (form) => readThreatText(form, "element"));
    if (!value) return;
    await this.#update((system) => {
      if (system.elements.some((element) => element.toLocaleLowerCase("pt-BR") === value.toLocaleLowerCase("pt-BR"))) {
        ui.notifications.warn(localizeThreat("DuplicateElement"));
        return;
      }
      return { "system.elements": [...system.elements, value] };
    });
  }

  async #addSkill(): Promise<void> {
    if (this.#customSkillPicker) return;
    const picker = this.#customSkillPicker = new AbortController();
    const canEdit = () => this.#canEdit && this.#editMode && !picker.signal.aborted;
    const picked = await pickActorSkill(this.#actor, () => ACTOR_CHECK_SKILLS.filter(({ selection }) =>
      !this.#system.skills.some(entry => threatSkillKey(entry) === threatSkillKey(selection))), picker.signal)
      .finally(() => { this.#customSkillPicker = undefined; });
    if (!picked || !canEdit()) return;
    if (isCustomSkillKey(picked.selection.key)) {
      await addCustomSkill(this.#actor, picked.selection, picked.die, canEdit);
      return;
    }
    const skill = { ...picked.selection, die: picked.die };
    await this.#update((system) => {
      if (!canEdit() || system.skills.some((entry) => threatSkillKey(entry) === threatSkillKey(skill))) return;
      return { "system.skills": [...system.skills, skill] };
    });
  }

  async #removeSkill(id: string): Promise<void> {
    const customKey = id.startsWith("skill:") ? id.slice("skill:".length) : undefined;
    if (isCustomSkillKey(customKey)) {
      const canEdit = () => this.#canEdit && this.#editMode;
      if (this.#system.actions.some(({ check }) => check?.kind === "skill" && check.key === customKey)) {
        ui.notifications.warn(localizeThreat("SkillInUse"));
        return;
      }
      try { await updateActorCustomSkill(this.#actor, customKey, null, "remove", canEdit); }
      catch (error) {
        ui.notifications.warn(error instanceof Error ? error.message : localizeThreat("OperationFailed"));
      }
      return;
    }
    await this.#update((system) => {
      const matches = (check: { kind: string; key: string } | null | undefined) =>
        check && check.kind !== "attribute" && threatSkillKey(check) === id;
      if (system.actions.some(({ check }) => matches(check))
        || collectOwnedAbilities(this.#items).some(({ useCollection }) =>
          useCollection.uses.some(({ combatAction }) => matches(combatAction?.check)))) {
        ui.notifications.warn(localizeThreat("SkillInUse"));
        return;
      }
      return { "system.skills": system.skills.filter((skill) => threatSkillKey(skill) !== id) };
    });
  }

  async #addCondition(): Promise<void> {
    const label = await editThreatFields(localizeThreat("AddCondition"), [{
      name: "label", label: localizeThreat("Condition"), value: "", required: true,
    }], (form) => readThreatText(form, "label"));
    if (!label) return;
    await this.#update((system) => ({
      "system.conditions": [...system.conditions, { id: foundry.utils.randomID(), label }],
    }));
  }

  get #items(): ThreatItems {
    return this.#actor.getEmbeddedCollection("Item") as ThreatItems;
  }

  #ability(id: string): foundry.documents.Item | undefined {
    const item = this.#items.get(id);
    return item?.type === ABILITY_ITEM_TYPE ? item : undefined;
  }

  async #createAbility(): Promise<void> {
    const name = localizeThreat("NewAbility");
    const [item] = await this.#actor.createEmbeddedDocuments("Item", [{
      name, type: ABILITY_ITEM_TYPE,
    }]);
    (item as foundry.documents.Item | undefined)?.sheet?.render(true);
  }

  async #addExistingAbility(): Promise<void> {
    const entries = await loadAvailableSingleItems(ABILITY_CATALOG);
    if (!entries.length) {
      ui.notifications.warn(localizeThreat("NoAbilitySources"));
      return;
    }
    const selected = await editThreatFields(localizeThreat("AddExistingAbility"), [{
      name: "ability", label: localizeThreat("Ability"), value: "",
      options: entries.map(({ key, name, origin }) => ({ value: key, label: `${name} (${origin})` })),
    }], (form) => entries.find(({ key }) => key === readThreatText(form, "ability")));
    if (!selected || !this.#editMode) return;
    const item = await resolveSingleItemCatalogSource(selected.source, ABILITY_CATALOG);
    if (this.#editMode) await this.#copyAbility(item);
  }

  async #copyAbility(item: foundry.documents.Item) {
    if (!this.#canEdit || !item.visible || item.isEmbedded) return null;
    const sourceUuid = item.uuid;
    if (this.#copyingAbilitySources.has(sourceUuid)) return null;
    const existing = [...this.#items].find((owned) =>
      owned.type === ABILITY_ITEM_TYPE && readOwnedAbilitySourceUuid(owned) === sourceUuid,
    );
    if (existing) {
      ui.notifications.info(game.i18n.format(`${THREAT_I18N}.AbilityAlreadyAdded`, { name: existing.name }));
      return { item: existing, created: false };
    }

    this.#copyingAbilitySources.add(sourceUuid);
    try {
      const [created] = await this.#actor.createEmbeddedDocuments("Item", [createAbilitySnapshot(item)]);
      if (!created) throw new Error("The Ability creation was not confirmed.");
      return { item: created as foundry.documents.Item, created: true };
    } finally {
      this.#copyingAbilitySources.delete(sourceUuid);
    }
  }

  protected override async _onDropItem(event: DragEvent, item: foundry.documents.Item) {
    if (item.type !== ABILITY_ITEM_TYPE) return null;
    if (item.actor === this.#actor) {
      return this.#canEdit && this.#editMode ? super._onDropItem(event, item) : null;
    }
    let result;
    try {
      result = await this.#copyAbility(item);
    } catch (error) {
      ThreatSheet.#reportError(error);
      return null;
    }
    if (!result) return null;

    const ability = result.item;
    this.tabGroups.content = "abilities";
    await this.render({ force: true });
    if (result.created) {
      ui.notifications.info(game.i18n.format(`${THREAT_I18N}.AbilityDropped`, {
        name: ability.name,
        tab: game.i18n.localize("ORDEMPARANORMAL2.AgentSheet.Tabs.Abilities"),
      }));
    }
    return ability;
  }

  protected override async _onDropFolder(): Promise<null> {
    return null;
  }

  async #editCharacteristic(field: string): Promise<void> {
    const label = localizeThreat(`Traits.${field}`);
    const text = THREAT_TRAIT_TEXTS.find((key) => key === field);
    if (text) {
      const value = await editThreatFields(label, [{
        name: "description", label, value: this.#system.characteristics[text], multiline: true,
      }], (form) => readThreatText(form, "description"));
      if (value !== null) await this.#update(() => ({ [`system.characteristics.${text}`]: value }));
      return;
    }
  }

  async #useAbilityForm(itemId: string, useId: string): Promise<void> {
    if (this.#rollInFlight) return;
    this.#rollInFlight = true;
    try {
      await this.#pendingUpdate;
      const item = this.#ability(itemId);
      if (!item) return;
      const result = await executeAbilityForm(this.#actor, item, useId);
      switch (result.status) {
        case "success":
        case "cancelled": return;
        case "publication-failed": ui.notifications.error(localizeThreat("PublicationFailed")); return;
        case "forbidden": ui.notifications.warn(localizeThreat("NoRollPermission")); return;
        case "changed": ui.notifications.warn(localizeThreat("CheckChanged")); return;
        case "missing-check": ui.notifications.warn(localizeThreat("MissingSkill")); return;
        case "unavailable":
          ui.notifications.warn(localizeThreat(result.reason === "minimum-level" ? "NeedsAgentLevel" : "NeedsDetermination"));
          return;
        case "insufficient": ui.notifications.warn(localizeThreat("InsufficientAbilityCost")); return;
        default: ui.notifications.warn(localizeThreat("OperationFailed"));
      }
    } finally {
      this.#rollInFlight = false;
    }
  }

  async #roll(intent: ThreatCheckIntent): Promise<void> {
    if (this.#rollInFlight) return;
    this.#rollInFlight = true;
    try {
      await this.#pendingUpdate;
      const result = await performThreatCheck(this.#actor, intent, this.#actor.token ?? undefined);
      if (result === "changed" || result === "forbidden") {
        ui.notifications.warn(localizeThreat(result === "changed" ? "CheckChanged" : "NoRollPermission"));
      }
    } finally {
      this.#rollInFlight = false;
    }
  }
}
