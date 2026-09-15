import type { HandlebarsTemplatePart } from "@client/applications/api/handlebars-application.mjs";

import { openPoiPicker, type PoiPickerHandle } from "../points-of-interest/poi-picker";
import {
  resolvePoiAssociation,
  type PoiSelection,
} from "../../adapters/foundry/points-of-interest/poi-catalog";
import {
  buildPoiRegionAssociationUpdate,
  POI_REGION_FLAG,
  readPoiRegionAssociation,
  type PoiAssociationDraft,
} from "../../adapters/foundry/points-of-interest/poi-region-association";
import { SYSTEM_ID } from "../../config/system-config";

const TEMPLATE_ROOT = "systems/ordemparanormal2/templates/region";
const { RegionConfig } = foundry.applications.sheets as unknown as
  FoundryApplicationSheetsWithRegionConfig;
const { footer: baseFooter, ...baseParts } = RegionConfig.PARTS;

interface PoiRegionView {
  readonly canConfigure: boolean;
  readonly status: string;
  readonly choosing: boolean;
  readonly removeDisabled: boolean;
  readonly hint: string;
}

function localize(key: string): string {
  return game.i18n.localize(
    `ORDEMPARANORMAL2.PointOfInterest.RegionConfig.${key}`,
  );
}

export class InteractiveRegionConfig extends RegionConfig {
  static override DEFAULT_OPTIONS = {
    classes: ["ordemparanormal2", "op2-interactive-region-config"],
  };

  static override TABS = {
    ...RegionConfig.TABS,
    sheet: {
      ...RegionConfig.TABS.sheet,
      tabs: [
        ...RegionConfig.TABS.sheet.tabs,
        {
          id: "point-of-interest",
          icon: "fa-solid fa-magnifying-glass-location",
          label: "ORDEMPARANORMAL2.PointOfInterest.RegionConfig.Title",
        },
      ],
    },
  };

  static override PARTS: Record<string, HandlebarsTemplatePart> = {
    ...baseParts,
    "point-of-interest": {
      template: `${TEMPLATE_ROOT}/poi-tab.hbs`,
    },
    ...(baseFooter ? { footer: baseFooter } : {}),
  };

  #draft: PoiAssociationDraft = { kind: "unchanged" };
  #selection: PoiSelection | null = null;
  #picker: PoiPickerHandle | null = null;
  #pickerRevision = 0;
  #form: HTMLFormElement | null = null;
  readonly #formDataListener: EventListener = event => {
    if (!this.#canConfigure) return;
    const formData = (event as FormDataEvent).formData;
    if (!(formData instanceof foundry.applications.ux.FormDataExtended)) return;
    const data = formData as unknown as { set(name: string, value: unknown): void };
    for (const [path, value] of Object.entries(
      buildPoiRegionAssociationUpdate(this.#draft),
    )) data.set(path, value);
  };

  get #region(): foundry.documents.RegionDocument {
    return this.document;
  }

  get #scene(): foundry.documents.Scene | null {
    return this.#region.parent;
  }

  get #canConfigure(): boolean {
    const scene = this.#scene;
    const id = this.#region.id;
    return !!game.user?.isGM && this.isEditable && !!scene && !!id
      && scene.regions.get(id) === this.#region;
  }

  async #preparePoiView(): Promise<PoiRegionView> {
    if (!this.#canConfigure) return {
      canConfigure: false,
      status: "",
      choosing: false,
      removeDisabled: true,
      hint: "",
    };
    const raw = this.#region.getFlag(SYSTEM_ID, POI_REGION_FLAG);
    let status: string;
    if (this.#draft.kind === "remove") status = localize("None");
    else if (this.#draft.kind === "associate" && this.#selection) {
      status = `${this.#selection.name} — ${this.#selection.origin}`;
    } else {
      const association = readPoiRegionAssociation(this.#region);
      if (!association) status = localize(raw === undefined ? "None" : "Invalid");
      else {
        const selection = await resolvePoiAssociation(association.itemUuid);
        status = selection
          ? `${selection.name} — ${selection.origin}`
          : localize("Unavailable");
      }
    }
    return {
      canConfigure: this.#canConfigure,
      status,
      choosing: this.#picker !== null,
      removeDisabled: this.#draft.kind === "remove"
        || (this.#draft.kind === "unchanged" && raw === undefined),
      hint: localize(this.#draft.kind === "unchanged" ? "SaveHint" : "Pending"),
    };
  }

  protected override async _prepareContext(
    options: unknown,
  ): Promise<Record<string, unknown>> {
    const context = await super._prepareContext(options);
    return {
      ...context,
      poiRegion: await this.#preparePoiView(),
    };
  }

  protected override async _preparePartContext(
    partId: string,
    context: Record<string, unknown>,
    options: unknown,
  ): Promise<Record<string, unknown>> {
    const partContext = await super._preparePartContext(partId, context, options);
    if (partId !== "point-of-interest") return partContext;
    const classes = String(partContext.tabClasses ?? "")
      .split(/\s+/u)
      .filter(className => className && className !== "active");
    if (this.tabGroups.sheet === "point-of-interest") classes.push("active");
    return { ...partContext, tabClasses: classes.join(" ") };
  }

  protected override async _onRender(
    context: object,
    options: unknown,
  ): Promise<void> {
    await super._onRender(context, options);
    if (this.#form !== this.form) {
      this.#form?.removeEventListener("formdata", this.#formDataListener);
      this.#form = this.form;
      this.#form?.addEventListener("formdata", this.#formDataListener);
    }
  }

  protected override _attachPartListeners(
    partId: string,
    htmlElement: HTMLElement,
    options: unknown,
  ): void {
    super._attachPartListeners(partId, htmlElement, options);
    if (partId !== "point-of-interest") return;
    htmlElement.querySelectorAll<HTMLElement>("[data-op2-action]").forEach(element => {
      element.addEventListener("click", () => {
        if (element.dataset.op2Action === "choose-poi") void this.#choosePoi();
        else if (element.dataset.op2Action === "remove-poi") void this.#removePoi();
      });
    });
  }

  async #choosePoi(): Promise<void> {
    if (!this.#canConfigure || this.#picker) return;
    const picker = openPoiPicker();
    const revision = ++this.#pickerRevision;
    this.#picker = picker;
    await this.render({ force: true });
    const selection = await picker.result;
    if (revision !== this.#pickerRevision || this.#picker !== picker) return;
    this.#picker = null;
    if (selection) {
      this.#selection = selection;
      this.#draft = {
        kind: "associate",
        association: { itemUuid: selection.itemUuid, name: selection.name },
      };
    }
    await this.render({ force: true });
  }

  async #removePoi(): Promise<void> {
    if (!this.#canConfigure) return;
    this.#draft = { kind: "remove" };
    this.#selection = null;
    const picker = this.#picker;
    this.#picker = null;
    this.#pickerRevision++;
    await picker?.close();
    await this.render({ force: true });
  }

  protected override _onClose(options: unknown): void {
    this.#pickerRevision++;
    const picker = this.#picker;
    this.#picker = null;
    void picker?.close();
    this.#form?.removeEventListener("formdata", this.#formDataListener);
    this.#form = null;
    super._onClose(options);
  }
}
