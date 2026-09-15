import type { ApplicationRenderOptions } from "@client/applications/_types.mjs";
import type {
  HandlebarsRenderOptions,
  HandlebarsTemplatePart,
} from "@client/applications/api/handlebars-application.mjs";

const ADVENTURE_IMPORT_TEMPLATE =
  "systems/ordemparanormal2/templates/applications/adventure-import.hbs";

type FileSlot = "pdf" | "actOne" | "actTwo";

// Temporary display data; no selected file is inspected to produce this preview.
const MOCK_ANALYSIS_RESULT = [
  { labelKey: "Characters", count: 12, icon: "fa-solid fa-user" },
  { labelKey: "Abilities", count: 86, icon: "fa-solid fa-wand-sparkles" },
  { labelKey: "Scenes", count: 14, icon: "fa-solid fa-map" },
  { labelKey: "PointsOfInterest", count: 9, icon: "fa-solid fa-magnifying-glass-location" },
  { labelKey: "Assets", count: 28, icon: "fa-solid fa-image" },
] as const;

interface AdventureImportRenderContext {
  readonly tabs?: never;
  readonly pdfName: string;
  readonly actOneName: string;
  readonly actTwoName: string;
  readonly canAnalyze: boolean;
  readonly hasPreview: boolean;
  readonly preview: readonly { label: string; count: number; summary: string; icon: string }[];
}

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class AdventureImportApplication extends HandlebarsApplicationMixin(ApplicationV2) {
  static override DEFAULT_OPTIONS = {
    id: "ordemparanormal2-adventure-import",
    actions: {
      selectPdf: AdventureImportApplication.#onSelectPdf,
      selectZip: AdventureImportApplication.#onSelectZip,
      analyzeFiles: AdventureImportApplication.#onAnalyzeFiles,
      importPreview: AdventureImportApplication.#onImportPreview,
    },
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

  readonly #files: Record<FileSlot, File | null> = {
    pdf: null,
    actOne: null,
    actTwo: null,
  };
  #hasPreview = false;

  protected override _canRender(options: ApplicationRenderOptions): boolean | void {
    if (!game.user.isGM) return false;
    return super._canRender(options);
  }

  protected override async _prepareContext(): Promise<AdventureImportRenderContext> {
    return {
      pdfName: this.#files.pdf?.name ?? "",
      actOneName: this.#files.actOne?.name ?? "",
      actTwoName: this.#files.actTwo?.name ?? "",
      canAnalyze: this.#files.pdf !== null,
      hasPreview: this.#hasPreview,
      preview: this.#hasPreview
        ? MOCK_ANALYSIS_RESULT.map(({ labelKey, count, icon }) => ({
            label: game.i18n.localize(
              `ORDEMPARANORMAL2.AdventureImport.MockPreview.${labelKey}`,
            ),
            summary: `${count} ${game.i18n.localize(
              `ORDEMPARANORMAL2.AdventureImport.MockPreview.Unit.${labelKey}`,
            )}`,
            count,
            icon,
          }))
        : [],
    };
  }

  protected override _attachPartListeners(
    partId: string,
    htmlElement: HTMLElement,
    options: HandlebarsRenderOptions,
  ): void {
    super._attachPartListeners(partId, htmlElement, options);
    if (partId !== "main") return;

    for (const input of htmlElement.querySelectorAll<HTMLInputElement>(
      "input[type='file'][data-file-slot]",
    )) {
      const slot = input.dataset.fileSlot;
      if (slot !== "pdf" && slot !== "actOne" && slot !== "actTwo") continue;
      input.addEventListener("change", () => {
        const file = input.files?.[0];
        if (!file) return;
        this.#files[slot] = file;
        this.#hasPreview = false;
        void this.render().catch((error) => {
          console.error("ordemparanormal2 | Failed to update Adventure Import preview.", error);
        });
      });
    }
  }

  #openFilePicker(slot: FileSlot): void {
    if (!game.user.isGM) return;
    this.element.querySelector<HTMLInputElement>(
      `input[type='file'][data-file-slot='${slot}']`,
    )?.click();
  }

  static #onSelectPdf(this: AdventureImportApplication): void {
    this.#openFilePicker("pdf");
  }

  static #onSelectZip(
    this: AdventureImportApplication,
    _event: PointerEvent,
    target: HTMLElement,
  ): void {
    const slot = target.dataset.fileSlot;
    if (slot === "actOne" || slot === "actTwo") this.#openFilePicker(slot);
  }

  static async #onAnalyzeFiles(this: AdventureImportApplication): Promise<void> {
    if (!game.user.isGM || !this.#files.pdf) return;
    this.#hasPreview = true;
    await this.render();
  }

  static #onImportPreview(this: AdventureImportApplication): void {
    if (!game.user.isGM || !this.#hasPreview) return;
    ui.notifications.info(
      game.i18n.localize("ORDEMPARANORMAL2.AdventureImport.MockPreview.NoImport"),
    );
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
