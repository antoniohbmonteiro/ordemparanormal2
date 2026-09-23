import type { ApplicationClosingOptions, ApplicationRenderOptions } from "@client/applications/_types.mjs";
import type {
  HandlebarsRenderOptions,
  HandlebarsTemplatePart,
} from "@client/applications/api/handlebars-application.mjs";

import type { AdventureImportIssueCode, MatchMethod } from "../../core/adventure-import/recognition-status";
import type { PdfEditionId, ZipPackageId } from "../../core/adventure-import/known-adventure-sources";
import type { PdfSourceAnalysis } from "../../core/adventure-import/recognize-pdf-source";
import type { AdventureAct, ZipSourceAnalysis } from "../../core/adventure-import/recognize-zip-source";
import {
  analyzeAdventureSources,
  analyzePdfSource,
  type AdventureSourceAnalysis,
} from "../../features/adventure-import/analyze-adventure-sources";
import { createAdventureAssetStorage } from "../../adapters/foundry/adventure-asset-storage";
import { createAdventureImageCropPort } from "../../adapters/files/adventure-image-crop";
import { createAdventureHandoutJournalPort } from "../../adapters/foundry/adventure-handout-journals";
import { PLAYTEST_ALPHA_ADVENTURE } from "../../config/adventure-definitions/playtest-alpha";
import {
  HandoutImportError, importAdventureHandouts,
} from "../../features/adventure-import/import-adventure-handouts";
import {
  materializeAdventureAssets,
  MaterializationError,
  type MaterializedAsset,
  type MaterializationResult,
} from "../../features/adventure-import/materialize-adventure-assets";
import { openAdventureImportPasswordDialog } from "./adventure-import-password-dialog";
import { PLAYTEST_ALPHA_AGENT_PRESETS, PLAYTEST_ALPHA_PRESET_REVISION } from "../../config/adventure-agent-presets/playtest-alpha";
import { usableAdventurePdf } from "../../features/adventure-import/prepare-adventure-agents";
import { AgentImportError, importAdventureAgents } from "../../features/adventure-import/import-adventure-agents";
import { createAdventureAgentActorPort } from "../../adapters/foundry/adventure-agent-actors";
import { openAdventureImportAgentConflictDialog } from "./adventure-import-agent-conflict-dialog";
import { PLAYTEST_ALPHA_SCENE_PRESETS } from "../../config/adventure-scene-presets/playtest-alpha";
import { createAdventureScenePort } from "../../adapters/foundry/adventure-scenes";
import { importAdventureScenes, SceneImportError } from "../../features/adventure-import/import-adventure-scenes";
import { materializeAdventureDerivedAssets } from "../../features/adventure-import/materialize-adventure-derived-assets";
import { createAdventureFolderPort } from "../../adapters/foundry/adventure-folders";
import { preflightAdventureFolders, type AdventureFolderRequirement } from "../../features/adventure-import/adventure-folders";
import { openAdventureImportSceneConflictDialog } from "./adventure-import-scene-conflict-dialog";
import { PLAYTEST_ALPHA_POI_PRESETS, PLAYTEST_ALPHA_POI_PRESET_REVISION } from "../../config/adventure-poi-presets/playtest-alpha";
import { createAdventurePoiItemPort } from "../../adapters/foundry/adventure-poi-items";
import { importAdventurePois, PoiImportError } from "../../features/adventure-import/import-adventure-pois";
import { openAdventureImportPoiConflictDialog } from "./adventure-import-poi-conflict-dialog";
import { assertImportableActs, evaluateActCompatibility, type ActCompatibility } from "../../core/adventure-import/adventure-source-compatibility";

const ADVENTURE_IMPORT_TEMPLATE =
  "systems/ordemparanormal2/templates/applications/adventure-import.hbs";

type FileSlot = "pdf" | "actOne" | "actTwo";

type SourceStatusModifier = "recognized" | "password-required" | "unsupported" | "unknown" | "invalid";

interface SourceStatusViewModel {
  readonly label: string;
  readonly modifier: SourceStatusModifier;
  readonly icon: string;
  readonly text: string;
  readonly issues: readonly string[];
}

interface ActContentViewModel {
  readonly icon: string;
  readonly label: string;
  readonly count: number;
}

interface DetectedActViewModel {
  readonly act: AdventureAct;
  readonly label: string;
  readonly status: string;
  readonly selectable: boolean;
  readonly selected: boolean;
  readonly selectionLabel: string;
  readonly issues: readonly string[];
  readonly content: readonly ActContentViewModel[];
}

interface AdventureImportRenderContext {
  readonly tabs?: never;
  readonly pdfName: string;
  readonly actOneName: string;
  readonly actTwoName: string;
  readonly canAnalyze: boolean;
  readonly hasAnalysis: boolean;
  readonly canImport: boolean;
  readonly importLabel: string;
  readonly isImporting: boolean;
  readonly progress: string;
  readonly pdfStatus: SourceStatusViewModel | null;
  readonly actCards: readonly DetectedActViewModel[];
  readonly otherStatuses: readonly SourceStatusViewModel[];
  readonly completionWarnings: readonly string[];
}

const localize = (key: string): string => game.i18n.localize(`ORDEMPARANORMAL2.AdventureImport.${key}`);
const format = (key: string, data: Record<string, string>): string =>
  game.i18n.format(`ORDEMPARANORMAL2.AdventureImport.${key}`, data);

const EDITION_LABEL_KEY: Record<PdfEditionId | ZipPackageId, string> = {
  "playtest-alpha-v1.0": "Analysis.Edition.PlaytestAlphaV10",
  "playtest-alpha-v1.1": "Analysis.Edition.PlaytestAlphaV11",
  "ato-i-extras": "Analysis.Edition.AtoIExtras",
  "ato-ii-extras": "Analysis.Edition.AtoIIExtras",
};

const ISSUE_LOCALIZATION_KEY: Record<AdventureImportIssueCode, string> = {
  "pdf-header-missing": "PdfHeaderMissing",
  "pdf-incorrect-password": "PdfIncorrectPassword",
  "pdf-parse-failed": "PdfParseFailed",
  "zip-eocd-not-found": "ZipEocdNotFound",
  "zip-zip64-unsupported": "ZipZip64Unsupported",
  "zip-encrypted-entries-unsupported": "ZipEncryptedEntriesUnsupported",
  "zip-invalid-entries": "ZipInvalidEntries",
  "zip-wrong-act-slot": "ZipWrongActSlot",
  "zip-supplemental-missing": "ZipSupplementalMissing",
  "zip-supplemental-mismatch": "ZipSupplementalMismatch",
  "zip-required-mismatch": "ZipRequiredMismatch",
  "zip-content-mismatch": "ZipContentMismatch",
  "zip-unexpected-payload": "ZipUnexpectedPayload",
};

function matchMethodLabel(method: MatchMethod): string {
  return localize(`Analysis.MatchMethod.${{
    hash: "Hash", content: "Content", structural: "Structural",
    "structural-hint": "StructuralHint", none: "None",
  }[method]}`);
}

function editionLabel(id: PdfEditionId | ZipPackageId): string {
  return localize(EDITION_LABEL_KEY[id]);
}

function pdfEditionLabel(analysis: PdfSourceAnalysis): string {
  const edition = analysis.edition ? editionLabel(analysis.edition) : "";
  return analysis.variant === "survivors" ? `${edition} · ${localize("Analysis.Pdf.SurvivorsLabel")}` : edition;
}

function localizeIssues(issues: PdfSourceAnalysis["issues"] | ZipSourceAnalysis["issues"]): readonly string[] {
  return issues.map((issue) => issue.path
    ? format(`Analysis.Issues.${ISSUE_LOCALIZATION_KEY[issue.code]}`, { path: issue.path })
    : localize(`Analysis.Issues.${ISSUE_LOCALIZATION_KEY[issue.code]}`));
}

function buildPdfStatusViewModel(analysis: PdfSourceAnalysis | null): SourceStatusViewModel | null {
  if (!analysis) return null;

  const label = localize("Analysis.Pdf.Label");
  const issues = localizeIssues(analysis.issues);

  if (analysis.passwordRequired) {
    const edition = analysis.edition ? pdfEditionLabel(analysis) : null;
    return {
      label,
      modifier: "password-required",
      icon: "fa-solid fa-lock",
      text: edition
        ? `${format("Analysis.Pdf.RecognizedPasswordRequired", { edition })} · ${matchMethodLabel(analysis.matchMethod)}`
        : localize("Analysis.Pdf.PasswordRequired"),
      issues,
    };
  }

  switch (analysis.status) {
    case "recognized": {
      const pages = analysis.facts.parseAttempt.status === "success"
        ? format("Analysis.Inventory.PageCount", { count: String(analysis.facts.parseAttempt.facts.pageCount) })
        : null;
      const edition = pdfEditionLabel(analysis);
      return {
        label,
        modifier: "recognized",
        icon: "fa-solid fa-check",
        text: `${pages && analysis.edition ? `${edition} · ${pages}` : format("Analysis.Pdf.Recognized", { edition })} · ${matchMethodLabel(analysis.matchMethod)}`,
        issues,
      };
    }
    case "unsupported":
      return { label, modifier: "unsupported", icon: "fa-solid fa-triangle-exclamation", text: localize("Analysis.Pdf.Unsupported"), issues };
    case "unknown":
      return { label, modifier: "unknown", icon: "fa-solid fa-circle-question", text: localize("Analysis.Pdf.Unknown"), issues };
    case "invalid":
      return { label, modifier: "invalid", icon: "fa-solid fa-circle-xmark", text: localize("Analysis.Pdf.Invalid"), issues };
  }
}

function buildZipStatusViewModel(label: string, analysis: ZipSourceAnalysis | null): SourceStatusViewModel | null {
  if (!analysis) return null;

  const issues = localizeIssues(analysis.issues);

  switch (analysis.status) {
    case "recognized":
      return { label, modifier: "recognized", icon: "fa-solid fa-check", text: `${localize("Analysis.Zip.Recognized")} · ${matchMethodLabel(analysis.matchMethod)}`, issues };
    case "unsupported":
      return {
        label,
        modifier: "unsupported",
        icon: "fa-solid fa-triangle-exclamation",
        text: `${format("Analysis.Zip.Unsupported", { edition: analysis.edition ? editionLabel(analysis.edition) : "" })} · ${matchMethodLabel(analysis.matchMethod)}`,
        issues,
      };
    case "unknown":
      return { label, modifier: "unknown", icon: "fa-solid fa-circle-question", text: localize("Analysis.Zip.Unknown"), issues };
    case "invalid":
      return { label, modifier: "invalid", icon: "fa-solid fa-circle-xmark", text: localize("Analysis.Zip.Invalid"), issues };
  }
}

function countReferencedPresets(
  references: readonly { readonly presetId: string }[],
  presets: readonly { readonly id: string; readonly act: AdventureAct }[],
  act: AdventureAct,
): number {
  const ids = new Set(presets.filter(preset => preset.act === act).map(preset => preset.id));
  return references.filter(reference => ids.has(reference.presetId)).length;
}

function isRecognizedAct(act: AdventureAct, analysis: ZipSourceAnalysis | null): boolean {
  return analysis?.status === "recognized" && analysis.edition === PLAYTEST_ALPHA_ADVENTURE.packageIds[act];
}

function buildDetectedActViewModel(act: AdventureAct, analysis: ZipSourceAnalysis | null,
  compatibility: ActCompatibility, selected: boolean): DetectedActViewModel {
  const selectable = compatibility.state === "ready" || compatibility.state === "ready-with-warnings";
  const reason = compatibility.reason ? localize(`Analysis.Availability.${{
    "pdf-unusable": "PdfUnusable", "pdf-act-unavailable": "PdfActUnavailable",
    "zip-not-provided": "ZipNotProvided", "zip-not-recognized": "ZipNotRecognized",
  }[compatibility.reason]}`) : "";
  return {
    act,
    label: localize(act === "actOne" ? "ActOne" : "ActTwo"),
    status: selectable ? `${localize(compatibility.state === "ready" ? "Analysis.Availability.Ready" : "Analysis.Availability.ReadyWithWarnings")}
      · ${matchMethodLabel(analysis!.matchMethod)}` : reason,
    selectable, selected,
    selectionLabel: localize(selected ? "Actions.DeselectAct" : "Actions.SelectAct"),
    issues: analysis ? [
      ...localizeIssues(analysis.issues),
      ...(compatibility.state === "ready-with-warnings" ? [localize("Analysis.SupplementalNotUsed")] : []),
    ] : [],
    content: selectable ? [
      { icon: "fa-solid fa-users", label: localize("Analysis.Content.Agents"),
        count: countReferencedPresets(PLAYTEST_ALPHA_ADVENTURE.actors, PLAYTEST_ALPHA_AGENT_PRESETS, act) },
      { icon: "fa-solid fa-book-open", label: localize("Analysis.Content.Handouts"),
        count: PLAYTEST_ALPHA_ADVENTURE.handouts.filter(handout => handout.act === act).length },
      { icon: "fa-solid fa-magnifying-glass", label: localize("Analysis.Content.PointsOfInterest"),
        count: countReferencedPresets(PLAYTEST_ALPHA_ADVENTURE.pointsOfInterest, PLAYTEST_ALPHA_POI_PRESETS, act) },
      { icon: "fa-solid fa-map", label: localize("Analysis.Content.Scenes"),
        count: countReferencedPresets(PLAYTEST_ALPHA_ADVENTURE.scenes, PLAYTEST_ALPHA_SCENE_PRESETS, act) },
    ] : [],
  };
}

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class AdventureImportApplication extends HandlebarsApplicationMixin(ApplicationV2) {
  static override DEFAULT_OPTIONS = {
    id: "ordemparanormal2-adventure-import",
    actions: {
      selectPdf: AdventureImportApplication.#onSelectPdf,
      selectZip: AdventureImportApplication.#onSelectZip,
      analyzeFiles: AdventureImportApplication.#onAnalyzeFiles,
      importAssets: AdventureImportApplication.#onImportAssets,
      toggleAct: AdventureImportApplication.#onToggleAct,
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
  #password: string | null = null;
  #analysis: AdventureSourceAnalysis | null = null;
  readonly #selectedActs = new Set<AdventureAct>();
  #result: MaterializationResult | null = null;
  #confirmedOnFailure: readonly MaterializedAsset[] = [];
  #isImporting = false;
  #progress = "";
  #completionWarnings: readonly string[] = [];

  protected override _canRender(options: ApplicationRenderOptions): boolean | void {
    if (!game.user.isGM) return false;
    return super._canRender(options);
  }

  protected override _onClose(options: ApplicationClosingOptions): void {
    this.#password = null;
    this.#analysis = null;
    this.#selectedActs.clear();
    this.#result = null;
    this.#completionWarnings = [];
    this.#confirmedOnFailure = [];
    super._onClose(options);
  }

  protected override async _prepareContext(): Promise<AdventureImportRenderContext> {
    return {
      pdfName: this.#files.pdf?.name ?? "",
      actOneName: this.#files.actOne?.name ?? "",
      actTwoName: this.#files.actTwo?.name ?? "",
      canAnalyze: this.#files.pdf !== null && !this.#isImporting,
      hasAnalysis: this.#analysis !== null,
      canImport: !this.#isImporting && game.user.isGM && game.users.activeGM?.id === game.user.id
        && this.#selectedActs.size > 0 && [...this.#selectedActs].every((act) => {
          const state = this.#analysis?.acts[act].state;
          return state === "ready" || state === "ready-with-warnings";
        }),
      importLabel: localize([...this.#selectedActs].some((act) => this.#analysis?.acts[act].state === "ready-with-warnings")
        ? "Actions.ImportWithWarnings" : "Actions.Import"),
      isImporting: this.#isImporting,
      progress: this.#progress,
      completionWarnings: this.#completionWarnings,
      pdfStatus: buildPdfStatusViewModel(this.#analysis?.pdf ?? null),
      actCards: [
        this.#analysis ? buildDetectedActViewModel("actOne", this.#analysis.actOne,
          this.#analysis.acts.actOne, this.#selectedActs.has("actOne")) : null,
        this.#analysis ? buildDetectedActViewModel("actTwo", this.#analysis.actTwo,
          this.#analysis.acts.actTwo, this.#selectedActs.has("actTwo")) : null,
      ].filter((act): act is DetectedActViewModel => act !== null),
      otherStatuses: ([
        ["actOne", this.#analysis?.actOne ?? null],
        ["actTwo", this.#analysis?.actTwo ?? null],
      ] as const).flatMap(([act, source]) => {
        if (!source || isRecognizedAct(act, source)) return [];
        const status = buildZipStatusViewModel(localize(act === "actOne" ? "ActOne" : "ActTwo"), source);
        return status ? [status] : [];
      }),
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
        if (this.#isImporting) return;
        const file = input.files?.[0];
        if (!file) return;
        this.#files[slot] = file;
        this.#analysis = null;
        this.#selectedActs.clear();
        this.#result = null;
        this.#completionWarnings = [];
        this.#confirmedOnFailure = [];
        if (slot === "pdf") this.#password = null;
        void this.render().catch((error) => {
          console.error("ordemparanormal2 | Failed to update Adventure Import preview.", error);
        });
      });
    }
  }

  #openFilePicker(slot: FileSlot): void {
    if (!game.user.isGM || this.#isImporting) return;
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

  static async #onToggleAct(this: AdventureImportApplication, _event: PointerEvent, target: HTMLElement): Promise<void> {
    const act = target.dataset.act;
    if ((act !== "actOne" && act !== "actTwo") || this.#isImporting || !this.#analysis) return;
    const state = this.#analysis.acts[act].state;
    if (state !== "ready" && state !== "ready-with-warnings") return;
    if (this.#selectedActs.has(act)) this.#selectedActs.delete(act);
    else this.#selectedActs.add(act);
    await this.render();
  }

  static async #onAnalyzeFiles(this: AdventureImportApplication): Promise<void> {
    if (!game.user.isGM || !this.#files.pdf || this.#isImporting) return;

    let analysis = await analyzeAdventureSources({
      pdf: this.#files.pdf,
      actOne: this.#files.actOne,
      actTwo: this.#files.actTwo,
      password: this.#password,
    });

    if (analysis.pdf.passwordRequired && this.#password === null) {
      const password = await openAdventureImportPasswordDialog();
      if (password !== null && this.#files.pdf) {
        const pdfRetry = await analyzePdfSource(this.#files.pdf, password);
        if (pdfRetry.facts.parseAttempt.status === "success") this.#password = password;
        analysis = { ...analysis, pdf: pdfRetry, acts: {
          actOne: evaluateActCompatibility("actOne", pdfRetry, analysis.actOne),
          actTwo: evaluateActCompatibility("actTwo", pdfRetry, analysis.actTwo),
        } };
      }
    }

    this.#analysis = analysis;
    this.#selectedActs.clear();
    for (const act of ["actOne", "actTwo"] as const) if (analysis.acts[act].state === "ready") this.#selectedActs.add(act);
    await this.render();
  }

  static async #onImportAssets(this: AdventureImportApplication): Promise<void> {
    if (!game.user.isGM || game.users.activeGM?.id !== game.user.id || this.#isImporting || !this.#analysis) return;
    const files = { actOne: this.#files.actOne, actTwo: this.#files.actTwo };
    const analysis = this.#analysis;
    if (!usableAdventurePdf(analysis.pdf)) return;
    const requestedActs = [...this.#selectedActs];
    const acknowledgeWarnings = requestedActs.some((act) => analysis.acts[act].state === "ready-with-warnings");
    try { assertImportableActs(analysis.acts, requestedActs, acknowledgeWarnings); } catch { return; }

    this.#isImporting = true;
    this.#progress = localize("Actions.Preparing");
    let stage: "assets" | "handouts" | "pois" | "actors" | "scenes" = "assets";
    try {
      await this.render();
      this.#result = null;
      this.#completionWarnings = [];
      this.#confirmedOnFailure = [];
      this.#result = await materializeAdventureAssets({
        ...files,
        actOneAnalysis: analysis.actOne,
        actTwoAnalysis: analysis.actTwo,
        pdfAnalysis: analysis.pdf,
        selectedActs: requestedActs,
        acknowledgeWarnings,
        storage: createAdventureAssetStorage(),
        mimeTypes: CONST.UPLOADABLE_FILE_EXTENSIONS,
        onProgress: async (completed, total) => {
          this.#progress = format("Actions.Progress", { completed: String(completed), total: String(total) });
          await this.render();
        },
      });
      const assetSource = { kind: "materialization" as const, result: this.#result };
      const folderPort = createAdventureFolderPort();
      const selectedActs = this.#result.materializedActs;
      const requirements: AdventureFolderRequirement[] = [];
      if (PLAYTEST_ALPHA_ADVENTURE.handouts.some(handout => selectedActs.includes(handout.act))) {
        requirements.push({ documentType: "JournalEntry", acts: selectedActs.filter(act => PLAYTEST_ALPHA_ADVENTURE.handouts.some(handout => handout.act === act)) });
      }
      if (PLAYTEST_ALPHA_AGENT_PRESETS.some(preset => selectedActs.includes(preset.act))) {
        requirements.push({ documentType: "Actor", acts: selectedActs.filter(act => PLAYTEST_ALPHA_AGENT_PRESETS.some(preset => preset.act === act)) });
      }
      if (PLAYTEST_ALPHA_POI_PRESETS.some(preset => selectedActs.includes(preset.act))) {
        requirements.push({ documentType: "Item", acts: selectedActs.filter(act => PLAYTEST_ALPHA_POI_PRESETS.some(preset => preset.act === act)) });
      }
      if (PLAYTEST_ALPHA_SCENE_PRESETS.some(preset => selectedActs.includes(preset.act))) {
        requirements.push({ documentType: "Scene", acts: selectedActs.filter(act => PLAYTEST_ALPHA_SCENE_PRESETS.some(preset => preset.act === act)) });
      }
      preflightAdventureFolders({ adventureId: PLAYTEST_ALPHA_ADVENTURE.id, requirements, folders: folderPort });
      stage = "handouts";
      this.#progress = localize("Actions.HandoutsPreparing");
      await this.render();
      await importAdventureHandouts({
        definition: PLAYTEST_ALPHA_ADVENTURE,
        acts: this.#result.materializedActs,
        assetSource,
        journals: createAdventureHandoutJournalPort(),
        folders: folderPort,
        onProgress: async (completed, total) => {
          this.#progress = format("Actions.HandoutsProgress", { completed: String(completed), total: String(total) });
          await this.render();
        },
      });
      stage = "pois";
      this.#progress = localize("Actions.PoisPreparing");
      await this.render();
      const poiPort = createAdventurePoiItemPort();
      const pois = await importAdventurePois({
        definition: PLAYTEST_ALPHA_ADVENTURE, presets: PLAYTEST_ALPHA_POI_PRESETS,
        revision: PLAYTEST_ALPHA_POI_PRESET_REVISION, acts: selectedActs,
        items: { ...poiPort, isAuthorized: () => poiPort.isAuthorized() && this.#analysis === analysis },
        folders: folderPort, assetSource, decide: openAdventureImportPoiConflictDialog,
        onProgress: async (completed, total) => {
          this.#progress = format("Actions.PoisProgress", { completed: String(completed), total: String(total) });
          await this.render();
        },
      });
      if (pois.cancelled) { ui.notifications.warn(localize("Actions.PoisCancelled")); return; }
      const summaries: string[] = [format("Actions.PoisSummary", {
        created: String(pois.created), updated: String(pois.updated),
        unchanged: String(pois.unchanged), preserved: String(pois.preserved),
      })];
      stage = "actors";
      this.#progress = localize("Actions.AgentsPreparing");
      await this.render();
      const actorPort = createAdventureAgentActorPort();
      const agents = await importAdventureAgents({
        definition: PLAYTEST_ALPHA_ADVENTURE, presets: PLAYTEST_ALPHA_AGENT_PRESETS, revision: PLAYTEST_ALPHA_PRESET_REVISION,
        acts: this.#result.materializedActs, pdf: analysis.pdf, assetSource,
        folders: folderPort,
        actors: { ...actorPort, isAuthorized: () => actorPort.isAuthorized() && this.#analysis === analysis },
        decide: openAdventureImportAgentConflictDialog,
        onProgress: async (completed, total) => {
          this.#progress = format("Actions.AgentsProgress", { completed: String(completed), total: String(total) });
          await this.render();
        },
      });
      if (agents.cancelled) { ui.notifications.warn(localize("Actions.AgentsCancelled")); return; }
      if (agents.preserved) summaries.push(format("Actions.AgentsSummary", { created: String(agents.created), updated: String(agents.updated), unchanged: String(agents.unchanged), preserved: String(agents.preserved) }));
      if (PLAYTEST_ALPHA_SCENE_PRESETS.some(p => this.#result!.materializedActs.includes(p.act))) {
        stage = "scenes";
        this.#progress = localize("Actions.ScenesPreparing");
        await this.render();
        const derivedAssets = await materializeAdventureDerivedAssets({
          definition: PLAYTEST_ALPHA_ADVENTURE, presets: PLAYTEST_ALPHA_SCENE_PRESETS,
          materialization: this.#result, storage: createAdventureAssetStorage(), images: createAdventureImageCropPort(),
        });
        for (const status of Object.values(derivedAssets)) if (status.status === "failed") {
          console.error("ordemparanormal2 | Adventure overlay unavailable.", status.error);
          ui.notifications.warn(localize(status.reason === "lookup" ? "Actions.OverlayLookupFailure" : "Actions.OverlayGenerationFailure"));
        }
        const scenePort = createAdventureScenePort();
        const scenes = await importAdventureScenes({ definition: PLAYTEST_ALPHA_ADVENTURE, presets: PLAYTEST_ALPHA_SCENE_PRESETS,
          materialization: this.#result, derivedAssets, scenes: { ...scenePort, isAuthorized: () => scenePort.isAuthorized() && this.#analysis === analysis },
          folders: folderPort,
          decide: openAdventureImportSceneConflictDialog,
          onProgress: async (completed, total) => {
            this.#progress = format("Actions.ScenesProgress", { completed: String(completed), total: String(total) });
            await this.render();
          },
        });
        if (scenes.cancelled) {
          ui.notifications.warn([localize("Actions.ScenesCancelled"), ...summaries].join(" "));
          return;
        }
        summaries.push(format("Actions.ScenesSummary", { created: String(scenes.created), updated: String(scenes.updated), unchanged: String(scenes.unchanged), preserved: String(scenes.preserved) }));
      }
      this.#completionWarnings = (this.#result.warnings ?? []).map((warning) => warning.path);
      ui.notifications.info([localize("Actions.ImportSuccess"),
        ...(this.#completionWarnings.length ? [format("Actions.ImportSuccessWithWarnings", {
          count: String(this.#completionWarnings.length),
        })] : []), ...summaries].join(" "));
    } catch (error) {
      if (stage === "pois") {
        const counts = error instanceof PoiImportError ? error.counts : { created: 0, updated: 0, unchanged: 0, preserved: 0 };
        ui.notifications.error(format("Actions.PoisImportFailure", {
          detail: error instanceof Error ? error.message : localize("Actions.UnexpectedFailure"),
          completed: String(counts.created + counts.updated + counts.unchanged), preserved: String(counts.preserved),
        }));
        console.error("ordemparanormal2 | Adventure POI import failed.", error);
        return;
      }
      if (stage === "scenes") {
        const counts = error instanceof SceneImportError ? error.counts : { created: 0, updated: 0, unchanged: 0, preserved: 0 };
        ui.notifications.error(format("Actions.ScenesImportFailure", { detail: error instanceof Error ? error.message : localize("Actions.UnexpectedFailure"),
          stage: error instanceof SceneImportError ? localize(`Actions.SceneStages.${error.stage}`) : "",
          completed: String(counts.created + counts.updated + counts.unchanged), preserved: String(counts.preserved) }));
        console.error("ordemparanormal2 | Adventure Scene import failed.", error);
        return;
      }
      if (stage === "actors") {
        const detail = error instanceof AgentImportError ? error.message : localize("Actions.UnexpectedFailure");
        const counts = error instanceof AgentImportError ? error.counts : { created: 0, updated: 0, unchanged: 0, preserved: 0 };
        ui.notifications.error(format("Actions.AgentsImportFailure", { detail,
          stage: error instanceof AgentImportError ? localize(`Actions.AgentStages.${error.stage}`) : "",
          agent: error instanceof AgentImportError && error.agent ? `${localize(error.agent.preset.act === "actOne" ? "ActOne" : "ActTwo")} · ${error.agent.preset.name}` : "",
          completed: String(counts.created + counts.updated + counts.unchanged), preserved: String(counts.preserved) }));
        return;
      }
      if (this.#result) {
        const detail = error instanceof HandoutImportError
          ? localize(`Actions.HandoutsFailure.${error.code}`)
            + `${error.act ? ` · ${localize(error.act === "actOne" ? "ActOne" : "ActTwo")}` : ""}`
            + `${error.documentId ? ` · ${PLAYTEST_ALPHA_ADVENTURE.handouts.find((handout) => handout.id === error.documentId)?.label ?? ""}` : ""}`
          : error instanceof Error ? error.message : localize("Actions.UnexpectedFailure");
        ui.notifications.error(format("Actions.HandoutsImportFailure", { detail }));
        console.error("ordemparanormal2 | Adventure handout import failed.", error);
        return;
      }
      this.#result = null;
      this.#confirmedOnFailure = error instanceof MaterializationError ? error.confirmedAssets : [];
      const stageKey = error instanceof MaterializationError
        ? { preflight: "ValidationFailure", directory: "DirectoryFailure", extract: "ExtractionFailure", upload: "UploadFailure" }[error.stage]
        : "UnexpectedFailure";
      const actLabel = error instanceof MaterializationError && error.act
        ? localize(error.act === "actOne" ? "ActOne" : "ActTwo")
        : "";
      const detail = `${localize(`Actions.${stageKey}`)}${actLabel ? ` · ${actLabel}` : ""}`
        + `${error instanceof MaterializationError && error.entryPath ? ` · ${error.entryPath}` : ""}`;
      ui.notifications.error(format("Actions.ImportFailure", {
        count: String(this.#confirmedOnFailure.length), detail,
      }));
      console.error("ordemparanormal2 | Adventure asset materialization failed.", error);
    } finally {
      this.#isImporting = false;
      this.#progress = "";
      await this.render();
    }
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
