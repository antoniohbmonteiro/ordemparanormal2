import type {
  DocumentSheetRenderContext,
  DocumentSheetRenderOptions,
} from "@client/applications/api/document-sheet.mjs";
import type {
  HandlebarsRenderOptions,
  HandlebarsTemplatePart,
} from "@client/applications/api/handlebars-application.mjs";

import { OCCUPATION_FALLBACK_IMAGE } from "../../features/occupations/manage-agent-occupation";

const OCCUPATION_SHEET_TEMPLATE =
  "systems/ordemparanormal2/templates/item/occupation-item-sheet.hbs";

interface OccupationItemSheetContext
  extends DocumentSheetRenderContext<foundry.documents.Item> {
  occupation: {
    readonly name: string;
    readonly img: string;
  };
}

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ItemSheetV2 } = foundry.applications.sheets as unknown as
  FoundryApplicationSheetsWithItemSheetV2;

export class OccupationItemSheet extends HandlebarsApplicationMixin(ItemSheetV2) {
  static override DEFAULT_OPTIONS = {
    classes: ["ordemparanormal2", "occupation-item-sheet"],
    form: { closeOnSubmit: false, submitOnChange: true },
    position: { width: 480, height: 180 },
    window: {
      contentClasses: ["op2-occupation-item-sheet-content"],
      resizable: true,
    },
  };

  static override PARTS: Record<string, HandlebarsTemplatePart> = {
    main: { template: OCCUPATION_SHEET_TEMPLATE },
  };

  protected override async _prepareContext(
    options: DocumentSheetRenderOptions & HandlebarsRenderOptions,
  ): Promise<OccupationItemSheetContext> {
    const context = (await super._prepareContext(
      options,
    )) as DocumentSheetRenderContext<foundry.documents.Item>;
    const item = this.document as foundry.documents.Item;
    return {
      ...context,
      occupation: {
        name: item.name,
        img: item.img ?? OCCUPATION_FALLBACK_IMAGE,
      },
    };
  }
}
