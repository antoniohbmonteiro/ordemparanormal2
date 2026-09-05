import type {
  ApplicationClosingOptions,
  ApplicationHeaderControlsEntry,
} from "@client/applications/_types.mjs";
import type {
  DocumentSheetRenderContext,
  DocumentSheetRenderOptions,
} from "@client/applications/api/document-sheet.mjs";
import type {
  HandlebarsRenderOptions,
  HandlebarsTemplatePart,
} from "@client/applications/api/handlebars-application.mjs";
import type { ContextMenuEntry } from "@client/applications/ux/context-menu.mjs";
import type FormDataExtended from "@client/applications/ux/form-data-extended.mjs";

import { collectOwnedAbilities } from "../../adapters/foundry/abilities/owned-abilities";
import { adjustOwnedAbilityResource } from "../../adapters/foundry/abilities/adjust-owned-ability-resource";
import { createAbilitySnapshot } from "../../adapters/foundry/abilities/ability-sources";
import { collectOwnedEquipment } from "../../adapters/foundry/equipment/owned-equipment";
import { adjustOwnedEquipmentUses } from "../../adapters/foundry/equipment/adjust-owned-equipment-uses";
import { canUserRollActor } from "../../adapters/foundry/actors/agent-check-permission";
import { publishAbilityMessage } from "../../adapters/foundry/chat/publish-ability-message";
import { publishEquipmentMessage } from "../../adapters/foundry/chat/publish-equipment-message";
import { readAgentAccentColor } from "../../adapters/foundry/actors/read-agent-accent-color";
import { parseAgentCheckSelection } from "../../application/checks/build-agent-check";
import {
  ABILITY_ITEM_TYPE,
  EQUIPMENT_ITEM_TYPE,
  LEGACY_OCCUPATION_FLAG,
  OCCUPATION_ITEM_TYPE,
  PROFILE_ITEM_TYPE,
  SYSTEM_ID,
} from "../../config/system-config";
import {
  AgentCheckPermissionError,
  performAgentCheck,
} from "../../features/checks/perform-agent-check";
import {
  getAgentProfile,
  setAgentProfile,
  AgentProfileConflictError,
} from "../../features/profiles/manage-agent-profile";
import {
  getAgentOccupation,
  setAgentOccupation,
  AgentOccupationConflictError,
} from "../../features/occupations/manage-agent-occupation";
import {
  useAbility,
  type AbilityUseResult,
} from "../../features/abilities/use-ability";
import {
  buildAgentSheetViewModel,
  type AgentSheetSystemData,
  type AgentSheetViewModel,
} from "../../ui/actor/agent-sheet-view-model";
import { restoreEmptyActorName } from "./agent-sheet-form";
import {
  confirmProfileReplacement,
  ProfilePicker,
} from "../profiles/profile-picker";
import {
  confirmOccupationReplacement,
  OccupationPicker,
} from "../occupations/occupation-picker";
import { AgentSheetSettings } from "./agent-sheet-settings";

const TEMPLATE_ROOT = "systems/ordemparanormal2/templates/actor";
const DIE_STEP_PARTIAL = `${TEMPLATE_ROOT}/partials/die-step-select.hbs`;

interface AgentSheetRenderContext
  extends DocumentSheetRenderContext<foundry.documents.Actor> {
  agent: AgentSheetViewModel;
  accentColor: string;
  aptitudeExpanded: boolean;
  canEditStructure: boolean;
  canRoll: boolean;
  editMode: boolean;
  profileConflict: boolean;
  occupationConflict: boolean;
  legacyOccupation: string;
}

function localizedAbilityDeletionContent(name: string): string {
  const paragraph = document.createElement("p");
  paragraph.textContent = game.i18n.format(
    "ORDEMPARANORMAL2.AgentSheet.Abilities.ConfirmDelete",
    { name },
  );
  return paragraph.outerHTML;
}

function localizedEquipmentDeletionContent(name: string): string {
  const paragraph = document.createElement("p");
  paragraph.textContent = game.i18n.format(
    "ORDEMPARANORMAL2.AgentSheet.Inventory.ConfirmDelete",
    { name },
  );
  return paragraph.outerHTML;
}

const { DialogV2, HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets as unknown as
  FoundryApplicationSheetsWithActorSheetV2;

export class AgentSheet extends HandlebarsApplicationMixin(ActorSheetV2) {
  static override DEFAULT_OPTIONS = {
    actions: {
      decreaseAbilityResource: AgentSheet.#onAdjustAbilityResource,
      increaseAbilityResource: AgentSheet.#onAdjustAbilityResource,
      decreaseEquipmentUses: AgentSheet.#onAdjustEquipmentUses,
      increaseEquipmentUses: AgentSheet.#onAdjustEquipmentUses,
      openOccupationPicker: AgentSheet.#onOpenOccupationPicker,
      openProfilePicker: AgentSheet.#onOpenProfilePicker,
      openSheetSettings: AgentSheet.#onOpenSheetSettings,
      rollCheck: AgentSheet.#onRollCheck,
      selectAgentTab: AgentSheet.#onSelectAgentTab,
      toggleEditMode: AgentSheet.#onToggleEditMode,
      useAbility: AgentSheet.#onUseAbility,
      useEquipment: AgentSheet.#onUseEquipment,
    },
    classes: ["ordemparanormal2", "agent-sheet"],
    form: { closeOnSubmit: false, submitOnChange: true },
    position: { width: 860, height: 760 },
    window: {
      contentClasses: ["op2-agent-sheet-content"],
      resizable: true,
    },
  };

  static override TABS = {
    content: {
      tabs: [
        { id: "abilities", label: "ORDEMPARANORMAL2.AgentSheet.Tabs.Abilities" },
        { id: "inventory", label: "ORDEMPARANORMAL2.AgentSheet.Tabs.Inventory" },
        { id: "notes", label: "ORDEMPARANORMAL2.AgentSheet.Tabs.Notes" },
      ],
      initial: "abilities",
    },
  };

  static override PARTS: Record<string, HandlebarsTemplatePart> = {
    main: {
      template: `${TEMPLATE_ROOT}/agent-sheet.hbs`,
      templates: [
        `${TEMPLATE_ROOT}/agent-sheet-identity.hbs`,
        `${TEMPLATE_ROOT}/agent-sheet-skills.hbs`,
        `${TEMPLATE_ROOT}/agent-sheet-abilities.hbs`,
        `${TEMPLATE_ROOT}/agent-sheet-inventory.hbs`,
        DIE_STEP_PARTIAL,
      ],
      scrollable: [
        ".op2-agent-sheet__active-content",
        ".op2-skills__list",
      ],
    },
  };

  private aptitudeExpanded = false;
  private editMode = false;
  #documentUpdateQueue: Promise<void> = Promise.resolve();
  #occupationPicker: OccupationPicker | null = null;
  #profilePicker: ProfilePicker | null = null;
  #settingsApplication: AgentSheetSettings | null = null;
  readonly #abilitiesInFlight = new Set<string>();
  readonly #equipmentInFlight = new Set<string>();

  get #canEditStructure(): boolean {
    return this.isEditable && this.editMode;
  }

  protected override _getHeaderControls(): ApplicationHeaderControlsEntry[] {
    return [
      ...super._getHeaderControls(),
      {
        action: "openSheetSettings",
        icon: "fa-solid fa-palette",
        label: "ORDEMPARANORMAL2.AgentSheet.Settings.MenuLabel",
        visible: this.isEditable,
      },
    ];
  }

  protected override async _prepareContext(
    options: DocumentSheetRenderOptions & HandlebarsRenderOptions,
  ): Promise<AgentSheetRenderContext> {
    const context = (await super._prepareContext(
      options,
    )) as DocumentSheetRenderContext<foundry.documents.Actor>;
    const actor = this.document as foundry.documents.Actor;
    let profile: foundry.documents.Item | null = null;
    let profileConflict = false;
    let occupation: foundry.documents.Item | null = null;
    let occupationConflict = false;

    try {
      profile = getAgentProfile(actor);
    } catch (error) {
      if (!(error instanceof AgentProfileConflictError)) throw error;
      profileConflict = true;
    }

    try {
      occupation = getAgentOccupation(actor);
    } catch (error) {
      if (!(error instanceof AgentOccupationConflictError)) throw error;
      occupationConflict = true;
    }

    const legacyFlag = actor.getFlag(SYSTEM_ID, LEGACY_OCCUPATION_FLAG);
    const legacyOccupation =
      legacyFlag && typeof legacyFlag === "object" &&
      typeof (legacyFlag as { value?: unknown }).value === "string"
        ? (legacyFlag as { value: string }).value
        : "";

    const items = [
      ...(actor.getEmbeddedCollection("Item") as Iterable<foundry.documents.Item>),
    ];

    return {
      ...context,
      accentColor: readAgentAccentColor(actor),
      agent: buildAgentSheetViewModel({
        name: actor.name,
        image: actor.img ?? "",
        system: actor.system as unknown as AgentSheetSystemData,
        profile: profile?.id
          ? {
              id: profile.id,
              name: profile.name,
              img: profile.img ?? "icons/svg/item-bag.svg",
            }
          : null,
        occupation: occupation?.id
          ? {
              id: occupation.id,
              name: occupation.name,
              img: occupation.img ?? "icons/svg/item-bag.svg",
            }
          : null,
        abilities: collectOwnedAbilities(items),
        equipment: collectOwnedEquipment(items),
      }),
      aptitudeExpanded: this.aptitudeExpanded,
      canEditStructure: this.#canEditStructure,
      canRoll: canUserRollActor(actor, game.user),
      editMode: this.editMode,
      profileConflict,
      occupationConflict,
      legacyOccupation,
    };
  }

  protected override async _onRender(
    context: object,
    options: DocumentSheetRenderOptions & HandlebarsRenderOptions,
  ): Promise<void> {
    await super._onRender(context, options);
    const accentColor = (context as AgentSheetRenderContext).accentColor;
    this.element.style.setProperty("--op2-accent", accentColor);
  }

  async #submitPendingChanges(): Promise<void> {
    await this.#documentUpdateQueue;
    if (this.isEditable) await this.submit();
  }

  static async #onSelectAgentTab(
    this: AgentSheet,
    event: PointerEvent,
    target: HTMLElement,
  ): Promise<void> {
    const tab = target.dataset.tab;
    if (!tab) return;
    await this.#submitPendingChanges();
    this.changeTab(tab, "content", {
      event,
      navElement: target,
      force: true,
      updatePosition: false,
    });
    await this.render({ force: true });
  }

  async #closeStructuralPickers(): Promise<void> {
    const profilePicker = this.#profilePicker;
    const occupationPicker = this.#occupationPicker;
    const results = await Promise.allSettled([
      profilePicker?.close(),
      occupationPicker?.close(),
    ]);

    if (
      results[0].status === "fulfilled" &&
      this.#profilePicker === profilePicker
    ) {
      this.#profilePicker = null;
    }
    if (
      results[1].status === "fulfilled" &&
      this.#occupationPicker === occupationPicker
    ) {
      this.#occupationPicker = null;
    }

    const failure = results.find(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    );
    if (failure) throw failure.reason;
  }

  static async #onToggleEditMode(this: AgentSheet): Promise<void> {
    if (!this.isEditable) return;
    await this.#documentUpdateQueue;

    if (this.editMode) {
      try {
        await this.#closeStructuralPickers();
      } catch (error) {
        console.error(
          "ordemparanormal2 | Failed to close Agent structural pickers",
          error,
        );
        ui.notifications.error(
          game.i18n.localize(
            "ORDEMPARANORMAL2.AgentSheet.Errors.EditModePickerCloseFailed",
          ),
        );
        return;
      }
    }

    this.editMode = !this.editMode;
    await this.render({ force: true });
  }

  static async #onOpenProfilePicker(this: AgentSheet): Promise<void> {
    if (!this.#canEditStructure) return;
    let picker: ProfilePicker | null = null;
    try {
      if (this.#profilePicker?.rendered) {
        this.#profilePicker.bringToFront();
        return;
      }

      picker = new ProfilePicker(
        this.document as foundry.documents.Actor,
      );
      this.#profilePicker = picker;
      picker.addEventListener(
        "close",
        () => {
          if (this.#profilePicker === picker) this.#profilePicker = null;
        },
        { once: true },
      );
      await picker.render({ force: true });
    } catch (error) {
      if (this.#profilePicker === picker) this.#profilePicker = null;
      console.error("ordemparanormal2 | Failed to open Profile picker", error);
      ui.notifications.error(
        game.i18n.localize(
          "ORDEMPARANORMAL2.ProfilePicker.Errors.OperationFailed",
        ),
      );
    }
  }

  static async #onOpenOccupationPicker(this: AgentSheet): Promise<void> {
    if (!this.#canEditStructure) return;
    let picker: OccupationPicker | null = null;
    try {
      if (this.#occupationPicker?.rendered) {
        this.#occupationPicker.bringToFront();
        return;
      }

      picker = new OccupationPicker(
        this.document as foundry.documents.Actor,
      );
      this.#occupationPicker = picker;
      picker.addEventListener(
        "close",
        () => {
          if (this.#occupationPicker === picker) this.#occupationPicker = null;
        },
        { once: true },
      );
      await picker.render({ force: true });
    } catch (error) {
      if (this.#occupationPicker === picker) this.#occupationPicker = null;
      console.error("ordemparanormal2 | Failed to open Occupation picker", error);
      ui.notifications.error(
        game.i18n.localize(
          "ORDEMPARANORMAL2.OccupationPicker.Errors.OperationFailed",
        ),
      );
    }
  }

  static async #onOpenSheetSettings(this: AgentSheet): Promise<void> {
    if (!this.isEditable) return;
    let settings: AgentSheetSettings | null = null;
    try {
      if (this.#settingsApplication?.rendered) {
        this.#settingsApplication.bringToFront();
        return;
      }

      settings = new AgentSheetSettings(
        this.document as foundry.documents.Actor,
      );
      this.#settingsApplication = settings;
      settings.addEventListener(
        "close",
        () => {
          if (this.#settingsApplication === settings) {
            this.#settingsApplication = null;
          }
        },
        { once: true },
      );
      await settings.render({ force: true });
    } catch (error) {
      if (this.#settingsApplication === settings) {
        this.#settingsApplication = null;
      }
      console.error("ordemparanormal2 | Failed to open Sheet settings", error);
      ui.notifications.error(
        game.i18n.localize(
          "ORDEMPARANORMAL2.AgentSheet.Settings.Errors.OpenFailed",
        ),
      );
    }
  }

  static #onEditAbility(
    this: AgentSheet,
    _event: PointerEvent,
    target: HTMLElement,
  ): void {
    if (!this.#canEditStructure || !target.dataset.itemId) return;
    const ability = (this.document as foundry.documents.Actor).getEmbeddedDocument(
      "Item",
      target.dataset.itemId,
    ) as foundry.documents.Item | null;
    if (ability?.type === ABILITY_ITEM_TYPE) ability.sheet.render(true);
  }

  static async #onDeleteAbility(
    this: AgentSheet,
    _event: PointerEvent,
    target: HTMLElement,
  ): Promise<void> {
    if (!this.#canEditStructure || !target.dataset.itemId) return;

    const actor = this.document as foundry.documents.Actor;
    const abilityId = target.dataset.itemId;
    const ability = actor.getEmbeddedDocument(
      "Item",
      abilityId,
    ) as foundry.documents.Item | null;
    if (ability?.type !== ABILITY_ITEM_TYPE) return;

    try {
      const confirmed = await DialogV2.confirm({
        classes: ["ordemparanormal2"],
        content: localizedAbilityDeletionContent(ability.name),
        modal: true,
        rejectClose: false,
        window: {
          title: game.i18n.localize(
            "ORDEMPARANORMAL2.AgentSheet.Abilities.DeleteTitle",
          ),
        },
      });
      if (confirmed !== true) return;

      await this.#submitPendingChanges();
      const current = actor.getEmbeddedDocument(
        "Item",
        abilityId,
      ) as foundry.documents.Item | null;
      if (current?.type !== ABILITY_ITEM_TYPE) return;

      await actor.deleteEmbeddedDocuments("Item", [abilityId]);
    } catch (error) {
      console.error("ordemparanormal2 | Failed to delete Ability", error);
      ui.notifications.error(
        game.i18n.localize(
          "ORDEMPARANORMAL2.AgentSheet.Abilities.DeleteFailed",
        ),
      );
    }
  }

  #getAbilityContextOptions(): ContextMenuEntry[] {
    return [
      {
        label: game.i18n.localize(
          "ORDEMPARANORMAL2.AgentSheet.Abilities.Edit",
        ),
        icon: '<i class="fa-solid fa-pen"></i>',
        onClick: (event, target) => {
          event.stopPropagation();
          AgentSheet.#onEditAbility.call(this, event, target);
        },
      },
      {
        label: game.i18n.localize(
          "ORDEMPARANORMAL2.AgentSheet.Abilities.Delete",
        ),
        icon: '<i class="fa-solid fa-trash"></i>',
        classes: "op2-ability-action--delete",
        onClick: async (event, target) => {
          event.stopPropagation();
          await AgentSheet.#onDeleteAbility.call(this, event, target);
        },
      },
    ];
  }

  static async #onUseAbility(
    this: AgentSheet,
    _event: PointerEvent,
    target: HTMLElement,
  ): Promise<void> {
    const abilityId = target.dataset.itemId;
    if (!this.isEditable || !abilityId || this.#abilitiesInFlight.has(abilityId)) {
      return;
    }

    this.#abilitiesInFlight.add(abilityId);
    const pendingUpdates = this.#documentUpdateQueue;
    const operation = pendingUpdates.then(async () => {
      if (this.isEditable) await this.submit();
      const actor = this.document as foundry.documents.Actor;
      const ability = actor.getEmbeddedDocument(
        "Item",
        abilityId,
      ) as foundry.documents.Item | null;
      if (!ability) {
        AgentSheet.#notifyAbilityResult({
          status: "invalid",
          reason: "not-owned",
        });
        return;
      }

      try {
        const result = await useAbility(actor, ability);
        AgentSheet.#notifyAbilityResult(result);
        if (result.status === "success") {
          try {
            await publishAbilityMessage(actor, ability);
          } catch (error) {
            console.error(
              "ordemparanormal2 | Failed to post Ability chat card",
              error,
            );
          }
          await this.render({ force: true });
        }
      } catch (error) {
        console.error("ordemparanormal2 | Failed to use Ability", error);
        ui.notifications.error(
          game.i18n.localize("ORDEMPARANORMAL2.AgentSheet.AbilityUse.Failed"),
        );
      }
    });
    this.#documentUpdateQueue = operation.catch(() => undefined);
    try {
      await operation;
    } finally {
      this.#abilitiesInFlight.delete(abilityId);
    }
  }

  static async #onAdjustAbilityResource(
    this: AgentSheet,
    event: PointerEvent,
    target: HTMLElement,
  ): Promise<void> {
    event.stopPropagation();
    const abilityId = target.dataset.itemId;
    const adjustment = target.dataset.resourceAdjustment;
    if (
      !this.isEditable ||
      !abilityId ||
      (adjustment !== "decrease" && adjustment !== "increase")
    ) {
      return;
    }

    const operation = this.#documentUpdateQueue.then(async () => {
      if (this.isEditable) await this.submit();
      const result = await adjustOwnedAbilityResource(
        this.document as foundry.documents.Actor,
        abilityId,
        adjustment === "decrease" ? -1 : 1,
      );
      if (result.status === "invalid") {
        throw new Error("Ability resource is unavailable.");
      }
      if (result.status === "updated") await this.render({ force: true });
    });
    this.#documentUpdateQueue = operation.catch(() => undefined);

    try {
      await operation;
    } catch (error) {
      console.error(
        "ordemparanormal2 | Failed to adjust Ability resource",
        error,
      );
      ui.notifications.error(
        game.i18n.localize(
          "ORDEMPARANORMAL2.AgentSheet.Errors.AbilityResourceUpdateFailed",
        ),
      );
      await this.render({ force: true });
    }
  }

  static #notifyAbilityResult(result: AbilityUseResult): void {
    if (result.status === "success") {
      ui.notifications.info(
        game.i18n.localize("ORDEMPARANORMAL2.AgentSheet.AbilityUse.Success"),
      );
      return;
    }
    if (result.status === "forbidden") {
      ui.notifications.warn(
        game.i18n.localize("ORDEMPARANORMAL2.AgentSheet.AbilityUse.Forbidden"),
      );
      return;
    }
    if (result.status === "insufficient") {
      ui.notifications.warn(
        game.i18n.localize(
          result.source === "determination"
            ? "ORDEMPARANORMAL2.AgentSheet.AbilityUse.InsufficientDetermination"
            : "ORDEMPARANORMAL2.AgentSheet.AbilityUse.InsufficientResource",
        ),
      );
      return;
    }
    ui.notifications.error(
      game.i18n.localize(
        result.reason === "missing-resource"
          ? "ORDEMPARANORMAL2.AgentSheet.AbilityUse.MissingResource"
          : "ORDEMPARANORMAL2.AgentSheet.AbilityUse.Invalid",
      ),
    );
  }

  static #onEditEquipment(
    this: AgentSheet,
    _event: PointerEvent,
    target: HTMLElement,
  ): void {
    if (!this.#canEditStructure || !target.dataset.itemId) return;
    const equipment = (this.document as foundry.documents.Actor).getEmbeddedDocument(
      "Item",
      target.dataset.itemId,
    ) as foundry.documents.Item | null;
    if (equipment?.type === EQUIPMENT_ITEM_TYPE) equipment.sheet.render(true);
  }

  static async #onDeleteEquipment(
    this: AgentSheet,
    _event: PointerEvent,
    target: HTMLElement,
  ): Promise<void> {
    if (!this.#canEditStructure || !target.dataset.itemId) return;

    const actor = this.document as foundry.documents.Actor;
    const equipmentId = target.dataset.itemId;
    const equipment = actor.getEmbeddedDocument(
      "Item",
      equipmentId,
    ) as foundry.documents.Item | null;
    if (equipment?.type !== EQUIPMENT_ITEM_TYPE) return;

    try {
      const confirmed = await DialogV2.confirm({
        classes: ["ordemparanormal2"],
        content: localizedEquipmentDeletionContent(equipment.name),
        modal: true,
        rejectClose: false,
        window: {
          title: game.i18n.localize(
            "ORDEMPARANORMAL2.AgentSheet.Inventory.DeleteTitle",
          ),
        },
      });
      if (confirmed !== true) return;

      await this.#submitPendingChanges();
      const current = actor.getEmbeddedDocument(
        "Item",
        equipmentId,
      ) as foundry.documents.Item | null;
      if (current?.type !== EQUIPMENT_ITEM_TYPE) return;

      await actor.deleteEmbeddedDocuments("Item", [equipmentId]);
    } catch (error) {
      console.error("ordemparanormal2 | Failed to delete Equipment", error);
      ui.notifications.error(
        game.i18n.localize(
          "ORDEMPARANORMAL2.AgentSheet.Inventory.DeleteFailed",
        ),
      );
    }
  }

  #getEquipmentContextOptions(): ContextMenuEntry[] {
    return [
      {
        label: game.i18n.localize(
          "ORDEMPARANORMAL2.AgentSheet.Inventory.Edit",
        ),
        icon: '<i class="fa-solid fa-pen"></i>',
        onClick: (event, target) => {
          event.stopPropagation();
          AgentSheet.#onEditEquipment.call(this, event, target);
        },
      },
      {
        label: game.i18n.localize(
          "ORDEMPARANORMAL2.AgentSheet.Inventory.Delete",
        ),
        icon: '<i class="fa-solid fa-trash"></i>',
        classes: "op2-equipment-action--delete",
        onClick: async (event, target) => {
          event.stopPropagation();
          await AgentSheet.#onDeleteEquipment.call(this, event, target);
        },
      },
    ];
  }

  static async #onUseEquipment(
    this: AgentSheet,
    _event: PointerEvent,
    target: HTMLElement,
  ): Promise<void> {
    const equipmentId = target.dataset.itemId;
    if (
      !this.isEditable ||
      !equipmentId ||
      this.#equipmentInFlight.has(equipmentId)
    ) {
      return;
    }

    this.#equipmentInFlight.add(equipmentId);
    const pendingUpdates = this.#documentUpdateQueue;
    const operation = pendingUpdates.then(async () => {
      if (this.isEditable) await this.submit();
      const actor = this.document as foundry.documents.Actor;
      const equipment = actor.getEmbeddedDocument(
        "Item",
        equipmentId,
      ) as foundry.documents.Item | null;
      if (equipment?.type !== EQUIPMENT_ITEM_TYPE) {
        ui.notifications.error(
          game.i18n.localize("ORDEMPARANORMAL2.AgentSheet.EquipmentUse.Failed"),
        );
        return;
      }

      try {
        await publishEquipmentMessage(actor, equipment);
      } catch (error) {
        console.error(
          "ordemparanormal2 | Failed to post Equipment chat card",
          error,
        );
        ui.notifications.error(
          game.i18n.localize("ORDEMPARANORMAL2.AgentSheet.EquipmentUse.Failed"),
        );
      }
    });
    this.#documentUpdateQueue = operation.catch(() => undefined);
    try {
      await operation;
    } finally {
      this.#equipmentInFlight.delete(equipmentId);
    }
  }

  static async #onAdjustEquipmentUses(
    this: AgentSheet,
    event: PointerEvent,
    target: HTMLElement,
  ): Promise<void> {
    event.stopPropagation();
    const equipmentId = target.dataset.itemId;
    const adjustment = target.dataset.resourceAdjustment;
    if (
      !this.isEditable ||
      !equipmentId ||
      (adjustment !== "decrease" && adjustment !== "increase")
    ) {
      return;
    }

    const operation = this.#documentUpdateQueue.then(async () => {
      if (this.isEditable) await this.submit();
      const result = await adjustOwnedEquipmentUses(
        this.document as foundry.documents.Actor,
        equipmentId,
        adjustment === "decrease" ? -1 : 1,
      );
      if (result.status === "invalid") {
        throw new Error("Equipment uses is unavailable.");
      }
      if (result.status === "updated") await this.render({ force: true });
    });
    this.#documentUpdateQueue = operation.catch(() => undefined);

    try {
      await operation;
    } catch (error) {
      console.error(
        "ordemparanormal2 | Failed to adjust Equipment uses",
        error,
      );
      ui.notifications.error(
        game.i18n.localize(
          "ORDEMPARANORMAL2.AgentSheet.Errors.EquipmentUsesUpdateFailed",
        ),
      );
      await this.render({ force: true });
    }
  }

  static async #onRollCheck(
    this: AgentSheet,
    _event: PointerEvent,
    target: HTMLElement,
  ): Promise<void> {
    const actor = this.document as foundry.documents.Actor;
    if (!canUserRollActor(actor, game.user)) {
      ui.notifications.warn(
        game.i18n.localize(
          "ORDEMPARANORMAL2.AgentSheet.Errors.NoRollPermission",
        ),
      );
      return;
    }
    try {
      const selection = parseAgentCheckSelection(
        target.dataset.checkKind,
        target.dataset.checkKey,
      );
      await this.#submitPendingChanges();
      await performAgentCheck(actor, selection);
    } catch (error) {
      if (error instanceof AgentCheckPermissionError) {
        ui.notifications.warn(
          game.i18n.localize(
            "ORDEMPARANORMAL2.AgentSheet.Errors.NoRollPermission",
          ),
        );
        return;
      }
      console.error("ordemparanormal2 | Failed to perform Agent check", error);
      ui.notifications.error(
        game.i18n.localize("ORDEMPARANORMAL2.AgentSheet.Errors.CheckFailed"),
      );
    }
  }

  protected override _processFormData(
    event: SubmitEvent | null,
    form: HTMLFormElement,
    formData: FormDataExtended,
  ): Record<string, unknown> {
    const submitData = super._processFormData(event, form, formData);
    const actor = this.document as foundry.documents.Actor;
    if (restoreEmptyActorName(submitData, actor.name)) {
      const input = form.querySelector<HTMLInputElement>('input[name="name"]');
      if (input) input.value = actor.name;
    }
    return submitData;
  }

  protected override _attachPartListeners(
    partId: string,
    htmlElement: HTMLElement,
    options: HandlebarsRenderOptions,
  ): void {
    super._attachPartListeners(partId, htmlElement, options);
    if (partId !== "main") return;

    if (this.#canEditStructure) {
      this._createContextMenu(
        () => this.#getAbilityContextOptions(),
        ".op2-ability-card__menu-trigger",
        {
          container: htmlElement,
          eventName: "click",
          fixed: true,
        },
      );
      this._createContextMenu(
        () => this.#getEquipmentContextOptions(),
        ".op2-equipment-card__menu-trigger",
        {
          container: htmlElement,
          eventName: "click",
          fixed: true,
        },
      );
    }

    const portraitImage = htmlElement.querySelector<HTMLImageElement>(
      'img[data-edit="img"]',
    );
    htmlElement
      .querySelector<HTMLButtonElement>("[data-portrait-trigger]")
      ?.addEventListener("click", () => portraitImage?.click());

    htmlElement
      .querySelector<HTMLDetailsElement>("[data-aptitude-details]")
      ?.addEventListener("toggle", (event) => {
        this.aptitudeExpanded = (event.currentTarget as HTMLDetailsElement).open;
      });
  }

  protected override async _preClose(
    options: ApplicationClosingOptions,
  ): Promise<void> {
    await super._preClose(options);
    await this.#documentUpdateQueue;
    await this.#closeStructuralPickers();
    await this.#settingsApplication?.close();
  }

  protected override _onClose(options: ApplicationClosingOptions): void {
    super._onClose(options);
    this.tabGroups.content = "abilities";
    this.aptitudeExpanded = false;
    this.editMode = false;
    this.#profilePicker = null;
    this.#occupationPicker = null;
    this.#settingsApplication = null;
  }

  #warnEditModeRequired(): void {
    ui.notifications.warn(
      game.i18n.localize("ORDEMPARANORMAL2.AgentSheet.Errors.EditModeRequired"),
    );
  }

  protected override async _onDropItem(
    event: DragEvent,
    item: foundry.documents.Item,
  ): Promise<foundry.documents.Item | null | undefined> {
    if (!this.isEditable) {
      ui.notifications.warn(
        game.i18n.localize("ORDEMPARANORMAL2.AgentSheet.Errors.ItemNotEditable"),
      );
      return null;
    }

    const actor = this.document as foundry.documents.Actor;

    if (item.type === ABILITY_ITEM_TYPE || item.type === EQUIPMENT_ITEM_TYPE) {
      const isEmbeddedReorder = item.actor === actor;
      if (isEmbeddedReorder) {
        if (!this.editMode) {
          this.#warnEditModeRequired();
          return null;
        }
        return super._onDropItem(event, item);
      }

      if (item.type === EQUIPMENT_ITEM_TYPE) {
        return super._onDropItem(event, item);
      }

      const [created] = await actor.createEmbeddedDocuments("Item", [
        createAbilitySnapshot(item),
      ]);
      return (created as foundry.documents.Item | undefined) ?? null;
    }

    if (!this.editMode) {
      this.#warnEditModeRequired();
      return null;
    }
    if (item.type === OCCUPATION_ITEM_TYPE) {
      try {
        const current = getAgentOccupation(actor);
        if (current?.id === item.id && item.actor === actor) return current;
        if (current && !(await confirmOccupationReplacement())) return null;
        return await setAgentOccupation(actor, item);
      } catch (error) {
        console.error("ordemparanormal2 | Failed to drop Occupation Item", error);
        ui.notifications.error(
          game.i18n.localize(
            "ORDEMPARANORMAL2.OccupationPicker.Errors.OperationFailed",
          ),
        );
        return null;
      }
    }
    if (item.type !== PROFILE_ITEM_TYPE) {
      ui.notifications.warn(
        game.i18n.localize(
          "ORDEMPARANORMAL2.AgentSheet.Errors.UnsupportedItemDrop",
        ),
      );
      return null;
    }

    try {
      const current = getAgentProfile(actor);
      if (current?.id === item.id && item.actor === actor) return current;
      if (current && !(await confirmProfileReplacement())) return null;
      return await setAgentProfile(actor, item);
    } catch (error) {
      console.error("ordemparanormal2 | Failed to drop Profile Item", error);
      ui.notifications.error(
        game.i18n.localize(
          "ORDEMPARANORMAL2.ProfilePicker.Errors.OperationFailed",
        ),
      );
      return null;
    }
  }

  protected override async _onDropFolder(
    _event: DragEvent,
    _folder: foundry.documents.Folder,
  ): Promise<null> {
    ui.notifications.warn(
      game.i18n.localize(
        "ORDEMPARANORMAL2.AgentSheet.Errors.UnsupportedFolderDrop",
      ),
    );
    return null;
  }
}
