import type { ApplicationRenderOptions } from "@client/applications/_types.mjs";
import type { HandlebarsTemplatePart } from "@client/applications/api/handlebars-application.mjs";

const ADVENTURE_IMPORT_TEMPLATE =
  "systems/ordemparanormal2/templates/applications/adventure-import.hbs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class AdventureImportApplication extends HandlebarsApplicationMixin(ApplicationV2) {
  static override DEFAULT_OPTIONS = {
    id: "ordemparanormal2-adventure-import",
    classes: ["ordemparanormal2", "op2-adventure-import"],
    position: { width: 800, height: "auto" as const },
    window: {
      title: "ORDEMPARANORMAL2.AdventureImport.Title",
      resizable: true,
      contentClasses: ["op2-adventure-import-content"],
    },
  };

  static override PARTS: Record<string, HandlebarsTemplatePart> = {
    main: {
      template: ADVENTURE_IMPORT_TEMPLATE,
      scrollable: [".op2-adventure-import__body"],
    },
  };

  protected override _canRender(options: ApplicationRenderOptions): boolean | void {
    if (!game.user.isGM) return false;
    return super._canRender(options);
  }
}

let importer: AdventureImportApplication | null = null;
let pendingRender: Promise<void> | null = null;

export async function openAdventureImporter(): Promise<void> {
  if (!game.user.isGM) return;

  if (importer) {
    const existing = importer;
    if (pendingRender) await pendingRender;
    if (importer === existing) existing.bringToFront();
    return;
  }

  const application = new AdventureImportApplication();
  importer = application;
  application.addEventListener("close", () => {
    if (importer === application) importer = null;
  }, { once: true });

  const renderTask = application.render({ force: true }).then(() => undefined);
  pendingRender = renderTask;
  try {
    await renderTask;
  } catch (error) {
    if (importer === application) importer = null;
    throw error;
  } finally {
    if (pendingRender === renderTask) pendingRender = null;
  }
}
