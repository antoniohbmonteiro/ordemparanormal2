import type { HandlebarsTemplatePart } from "@client/applications/api/handlebars-application.mjs";

import {
  buildTileInteractionFlagUpdate,
  EMPTY_TILE_INTERACTION_CONFIG,
  readTileInteractionConfig,
} from "../../adapters/foundry/tile-interactions/tile-interaction-config";

const TEMPLATE_ROOT = "systems/ordemparanormal2/templates/tile";
type SelectionKind = "Wall" | "Tile";

interface TileInteractionDraft {
  enabled: boolean;
  wallIds: string[];
  tileIds: string[];
}

interface TargetView {
  readonly id: string;
  readonly label: string;
  readonly detail: string;
  readonly unavailable: boolean;
}

interface SelectableDocument {
  readonly id: string | null;
  readonly documentName?: string;
  readonly parent?: foundry.documents.Scene | null;
  readonly name?: string;
  readonly door?: number;
  readonly c?: readonly number[];
  readonly x?: number;
  readonly y?: number;
}

interface SelectablePlaceable {
  readonly document: SelectableDocument;
  control(options?: { releaseOthers?: boolean }): boolean;
}

export function collectSelectedWallIds(
  placeables: readonly SelectablePlaceable[],
): { readonly ids: readonly string[]; readonly ignored: number } {
  const valid = placeables.filter(placeable => isDoor(placeable.document));
  return {
    ids: [...new Set(valid.flatMap(placeable => placeable.document.id ?? []))],
    ignored: placeables.length - valid.length,
  };
}

export function collectSelectedTileIds(
  placeables: readonly SelectablePlaceable[],
  controllerId: string | null,
): readonly string[] {
  return [...new Set(placeables.flatMap(placeable => {
    const id = placeable.document.id;
    return id && id !== controllerId ? [id] : [];
  }))];
}

interface SelectableLayer {
  readonly controlled: readonly SelectablePlaceable[];
  activate(options?: { tool: string }): unknown;
  releaseAll(options?: object): number;
  get(id: string): SelectablePlaceable | undefined;
}

interface SelectionCanvas {
  readonly scene: { readonly id: string | null } | null;
  getLayerByEmbeddedName(name: string): SelectableLayer | null;
}

const { TileConfig } = foundry.applications.sheets as unknown as
  FoundryApplicationSheetsWithTileConfig;
const { footer: baseFooter, ...baseParts } = TileConfig.PARTS;

function coordinateLabel(x: unknown, y: unknown): string {
  const displayX = typeof x === "number" ? Math.round(x) : "?";
  const displayY = typeof y === "number" ? Math.round(y) : "?";
  return `(${displayX}, ${displayY})`;
}

function wallTypeLabel(door: number | undefined): string {
  if (door === CONST.WALL_DOOR_TYPES.SECRET) {
    return game.i18n.localize("ORDEMPARANORMAL2.TileInteraction.Targets.SecretDoor");
  }
  if (door === CONST.WALL_DOOR_TYPES.DOOR) {
    return game.i18n.localize("ORDEMPARANORMAL2.TileInteraction.Targets.Door");
  }
  return game.i18n.localize("ORDEMPARANORMAL2.TileInteraction.Targets.InvalidWall");
}

function isDoor(document: SelectableDocument): boolean {
  return document.door === CONST.WALL_DOOR_TYPES.DOOR
    || document.door === CONST.WALL_DOOR_TYPES.SECRET;
}

export class InteractiveTileConfig extends TileConfig {
  static override DEFAULT_OPTIONS = {
    classes: ["ordemparanormal2", "op2-interactive-tile-config"],
  };

  static override TABS = {
    ...TileConfig.TABS,
    sheet: {
      ...TileConfig.TABS.sheet,
      tabs: [
        ...TileConfig.TABS.sheet.tabs,
        {
          id: "interaction",
          icon: "fa-solid fa-toggle-on",
          label: "ORDEMPARANORMAL2.TileInteraction.Tab",
        },
      ],
    },
  };

  static override PARTS: Record<string, HandlebarsTemplatePart> = {
    ...baseParts,
    interaction: {
      template: `${TEMPLATE_ROOT}/tile-interaction-tab.hbs`,
      scrollable: [".op2-tile-interaction__targets"],
    },
    ...(baseFooter ? { footer: baseFooter } : {}),
  };

  #draft: TileInteractionDraft | null = null;
  #selectionKind: SelectionKind | null = null;
  #selectionHookId: number | null = null;
  #selectedDocuments = new Map<string, SelectableDocument>();
  #form: HTMLFormElement | null = null;
  readonly #formDataListener: EventListener = event => {
    if (!this.#canConfigure) return;
    const formData = (event as FormDataEvent).formData;
    if (!(formData instanceof foundry.applications.ux.FormDataExtended)) return;
    const data = formData as unknown as { set(name: string, value: unknown): void };
    const draft = this.#getDraft();
    for (const [path, value] of Object.entries(
      buildTileInteractionFlagUpdate(draft),
    )) data.set(path, value);
  };

  get #tile(): foundry.documents.TileDocument<foundry.documents.Scene | null> {
    return this.document;
  }

  get #scene(): foundry.documents.Scene | null {
    return this.#tile.parent;
  }

  get #canConfigure(): boolean {
    return !!game.user?.isGM && this.isEditable && !!this.#scene;
  }

  #getDraft(): TileInteractionDraft {
    if (!this.#draft) {
      const config = readTileInteractionConfig(this.#tile)
        ?? EMPTY_TILE_INTERACTION_CONFIG;
      this.#draft = {
        enabled: config.enabled,
        wallIds: [...config.wallIds],
        tileIds: [...config.tileIds],
      };
    }
    return this.#draft;
  }

  #wallView(id: string): TargetView {
    const wall = this.#scene?.walls.get(id) as unknown as SelectableDocument | undefined;
    if (!wall) return {
      id,
      label: game.i18n.localize("ORDEMPARANORMAL2.TileInteraction.Targets.Unavailable"),
      detail: id,
      unavailable: true,
    };
    const c = wall.c ?? [];
    return {
      id,
      label: wallTypeLabel(wall.door),
      detail: `${coordinateLabel(c[0], c[1])} · ${id}`,
      unavailable: !isDoor(wall),
    };
  }

  #tileView(id: string): TargetView {
    const tile = this.#scene?.tiles.get(id) as unknown as SelectableDocument | undefined;
    if (!tile) return {
      id,
      label: game.i18n.localize("ORDEMPARANORMAL2.TileInteraction.Targets.Unavailable"),
      detail: id,
      unavailable: true,
    };
    return {
      id,
      label: tile.name?.trim() || game.i18n.localize(
        "ORDEMPARANORMAL2.TileInteraction.Targets.Tile",
      ),
      detail: `${game.i18n.localize("ORDEMPARANORMAL2.TileInteraction.Targets.Tile")} · ${coordinateLabel(tile.x, tile.y)} · ${id}`,
      unavailable: false,
    };
  }

  protected override async _prepareContext(
    options: unknown,
  ): Promise<Record<string, unknown>> {
    const context = await super._prepareContext(options);
    const draft = this.#getDraft();
    return {
      ...context,
      tileInteraction: {
        canConfigure: this.#canConfigure,
        enabled: draft.enabled,
        selectingWalls: this.#selectionKind === "Wall",
        selectingTiles: this.#selectionKind === "Tile",
        wallTargets: draft.wallIds.map(id => this.#wallView(id)),
        tileTargets: draft.tileIds.map(id => this.#tileView(id)),
      },
    };
  }

  protected override async _preparePartContext(
    partId: string,
    context: Record<string, unknown>,
    options: unknown,
  ): Promise<Record<string, unknown>> {
    const partContext = await super._preparePartContext(partId, context, options);
    if (partId !== "interaction") return partContext;
    const classes = String(partContext.tabClasses ?? "")
      .split(/\s+/u)
      .filter(className => className && className !== "active");
    if (this.tabGroups.sheet === "interaction") classes.push("active");
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
    if (partId !== "interaction") return;
    htmlElement.querySelector<HTMLInputElement>("[data-op2-enabled]")
      ?.addEventListener("change", event => {
        const checkbox = event.currentTarget as HTMLInputElement;
        this.#getDraft().enabled = checkbox.checked;
      });
    htmlElement.querySelectorAll<HTMLElement>("[data-op2-action]").forEach(element => {
      element.addEventListener("click", () => {
        void this.#handleAction(element, htmlElement);
      });
    });
  }

  async #handleAction(element: HTMLElement, htmlElement: HTMLElement): Promise<void> {
    if (!this.#canConfigure) return;
    const action = element.dataset.op2Action;
    if (action === "select-walls") return this.#beginSelection("Wall", htmlElement);
    if (action === "select-tiles") return this.#beginSelection("Tile", htmlElement);
    if (action === "use-walls") return this.#useSelection("Wall");
    if (action === "use-tiles") return this.#useSelection("Tile");
    if (action === "remove-wall" && element.dataset.targetId) {
      const draft = this.#getDraft();
      draft.wallIds = draft.wallIds.filter(id => id !== element.dataset.targetId);
      await this.render({ force: true });
    }
    if (action === "remove-tile" && element.dataset.targetId) {
      const draft = this.#getDraft();
      draft.tileIds = draft.tileIds.filter(id => id !== element.dataset.targetId);
      await this.render({ force: true });
    }
  }

  #stopSelection(): void {
    if (this.#selectionHookId !== null && this.#selectionKind) {
      Hooks.off(`control${this.#selectionKind}`, this.#selectionHookId);
    }
    this.#selectionHookId = null;
    this.#selectionKind = null;
    this.#selectedDocuments.clear();
  }

  #captureSelection(
    kind: SelectionKind,
    placeable: unknown,
    controlled: unknown,
  ): void {
    if (this.#selectionKind !== kind) return;
    const document = (placeable as { readonly document?: SelectableDocument } | null)
      ?.document;
    const id = document?.id;
    if (!document || !id || document.parent !== this.#scene) return;
    if (kind === "Tile" && id === this.#tile.id) return;
    if (controlled) this.#selectedDocuments.set(id, document);
    else this.#selectedDocuments.delete(id);
  }

  #selectionCanvas(): SelectionCanvas | null {
    const current = (globalThis as { canvas?: SelectionCanvas }).canvas;
    const scene = this.#scene;
    if (!current || !scene?.id || current.scene?.id !== scene.id) {
      ui.notifications.warn(game.i18n.localize(
        "ORDEMPARANORMAL2.TileInteraction.Warnings.SceneNotDisplayed",
      ));
      return null;
    }
    return current;
  }

  #beginSelection(kind: SelectionKind, htmlElement: HTMLElement): void {
    const current = this.#selectionCanvas();
    if (!current) return;
    const layer = current.getLayerByEmbeddedName(kind);
    if (!layer) return;
    this.#stopSelection();
    this.#selectionKind = kind;
    this.#selectionHookId = Hooks.on(
      `control${kind}`,
      (placeable: unknown, controlled: unknown) => {
        this.#captureSelection(kind, placeable, controlled);
      },
    );
    htmlElement.querySelectorAll<HTMLButtonElement>(
      '[data-op2-action^="use-"]',
    ).forEach(button => {
      button.hidden = button.dataset.op2Action !== `use-${kind.toLowerCase()}s`;
    });
    layer.activate({ tool: "select" });
    layer.releaseAll();
    const ids = kind === "Wall" ? this.#getDraft().wallIds : this.#getDraft().tileIds;
    for (const id of ids) {
      const placeable = layer.get(id);
      if (!placeable || (kind === "Wall" && !isDoor(placeable.document))) continue;
      if (kind === "Tile" && placeable.document.id === this.#tile.id) continue;
      placeable.control({ releaseOthers: false });
    }
    for (const placeable of layer.controlled) {
      this.#captureSelection(kind, placeable, true);
    }
  }

  async #useSelection(kind: SelectionKind): Promise<void> {
    if (this.#selectionKind !== kind) return;
    if (!this.#selectionCanvas()) return;
    const draft = this.#getDraft();
    if (kind === "Wall") {
      const documents = [...this.#selectedDocuments.values()].map(document => ({
        document,
        control: () => false,
      }));
      const { ids, ignored } = collectSelectedWallIds(documents);
      if (ignored > 0) {
        ui.notifications.warn(game.i18n.format(
          "ORDEMPARANORMAL2.TileInteraction.Warnings.InvalidWallsIgnored",
          { count: ignored },
        ));
      }
      if (ids.length === 0) {
        ui.notifications.warn(game.i18n.localize(
          "ORDEMPARANORMAL2.TileInteraction.Warnings.EmptyWallSelection",
        ));
        return;
      }
      draft.wallIds = [...ids];
    } else {
      const documents = [...this.#selectedDocuments.values()].map(document => ({
        document,
        control: () => false,
      }));
      draft.tileIds = [...collectSelectedTileIds(documents, this.#tile.id)];
    }
    this.#stopSelection();
    await this.render({ force: true });
  }

  protected override _onClose(options: unknown): void {
    this.#stopSelection();
    this.#form?.removeEventListener("formdata", this.#formDataListener);
    this.#form = null;
    super._onClose(options);
  }
}
