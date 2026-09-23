import type { HandlebarsTemplatePart } from "@client/applications/api/handlebars-application.mjs";
import type { HandlebarsRenderOptions } from "@client/applications/api/handlebars-application.mjs";
import type { ApplicationClosingOptions } from "@client/applications/_types.mjs";
import { mutatePoi, requestPoiScene, subscribePoiInvalidation, type PoiSceneResult } from "../../adapters/foundry/points-of-interest/poi-runtime-queries";
import { associatedRegionIds, readPoiVisibility, worldPoi } from "../../adapters/foundry/points-of-interest/poi-runtime-state";
import { locatePoiInCurrentScene } from "../../adapters/foundry/points-of-interest/poi-scene-locator";
import { openPoiPicker } from "./poi-picker";
import { openPoiUserRevealDialog } from "./poi-user-reveal-dialog";
import { openInvestigationApplication } from "./investigation-application";
import { listenPoiSceneMenuTriggers, poiSceneMenuEntries, showPoiSceneMenu, type PoiSceneMenuAction, type PoiMenuAnchor } from "./poi-scene-panel-menu";
import { poiSceneRowView } from "./poi-scene-panel-view";

const ROOT = "ORDEMPARANORMAL2.PointOfInterest.ScenePanel";
const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const open = new Map<string, PoiScenePanel>();

export class PoiScenePanel extends HandlebarsApplicationMixin(ApplicationV2) {
  static override DEFAULT_OPTIONS = {
    classes: ["ordemparanormal2", "op2-poi-scene-panel"],
    window: { title: `${ROOT}.Title`, resizable: true },
    position: { width: 700, height: "auto" as const },
    actions: {
      open: PoiScenePanel.#onOpen,
      add: PoiScenePanel.#onAdd,
    },
  };
  static override PARTS: Record<string, HandlebarsTemplatePart> = {
    main: { template: "systems/ordemparanormal2/templates/points-of-interest/poi-scene-panel.hbs" },
  };
  readonly #sceneId: string;
  #result: PoiSceneResult | null = null;
  #stop: (() => void) | null = null;
  #stopMenuTriggers: (() => void) | null = null;
  #closeMenu: (() => void) | null = null;
  #revision = 0;

  constructor(sceneId: string) {
    const sceneName = game.scenes.get(sceneId)?.name;
    const title = game.i18n.localize(`${ROOT}.Title`);
    super({ id: `op2-poi-scene-${sceneId}`, window: { title: sceneName ? `${title} – ${sceneName}` : title } });
    this.#sceneId = sceneId;
  }

  protected override async _prepareContext(): Promise<Record<string, unknown>> {
    const scene = game.scenes.get(this.#sceneId);
    const isGM = !!game.user?.isGM;
    const entries = this.#result && "entries" in this.#result ? this.#result.entries.map(entry => {
      const item = isGM ? worldPoi(entry.itemUuid) : null;
      const count = scene ? associatedRegionIds(scene, entry.itemUuid).length : 0;
      return poiSceneRowView(entry, item ? readPoiVisibility(item) : null, count, key => game.i18n.localize(key), isGM ? "gm" : "player");
    }) : [];
    return {
      sceneName: scene?.name ?? "",
      isGM: !!game.user?.isGM,
      loading: this.#result === null,
      error: this.#result && "error" in this.#result,
      entries,
      count: entries.length,
      countLabel: game.i18n.localize(`${ROOT}.${entries.length === 1 ? "CountOne" : "CountMany"}`),
    };
  }

  protected override _attachPartListeners(partId: string, element: HTMLElement, options: HandlebarsRenderOptions): void {
    super._attachPartListeners(partId, element, options);
    this.#closeMenu?.();
    this.#stopMenuTriggers?.();
    if (partId !== "main" || !game.user?.isGM) return;
    this.#stopMenuTriggers = listenPoiSceneMenuTriggers(element, (uuid, anchor) => this.#showMenu(uuid, anchor));
  }

  protected override async _onFirstRender(context: object, options: object): Promise<void> {
    await super._onFirstRender(context, options as never);
    this.#stop = subscribePoiInvalidation(() => { void this.refresh(); });
    void this.refresh();
  }

  async refresh(): Promise<void> {
    const revision = ++this.#revision;
    this.#result = null;
    void this.render();
    const result = await requestPoiScene(this.#sceneId);
    if (revision !== this.#revision) return;
    this.#result = result;
    await this.render();
  }

  static #entry(this: PoiScenePanel, target: HTMLElement): string | null {
    const uuid = target.closest<HTMLElement>("[data-item-uuid]")?.dataset.itemUuid;
    return uuid && this.#result && "entries" in this.#result && this.#result.entries.some(entry => entry.itemUuid === uuid) ? uuid : null;
  }

  static #onOpen(this: PoiScenePanel, _event: PointerEvent, target: HTMLElement): void {
    const uuid = PoiScenePanel.#entry.call(this, target);
    if (uuid) this.#openEntry(uuid);
  }

  #openEntry(uuid: string): void {
    const entry = this.#result && "entries" in this.#result ? this.#result.entries.find(value => value.itemUuid === uuid) : null;
    openInvestigationApplication({ sceneId: this.#sceneId, itemUuid: uuid, name: entry?.name ?? "" });
  }

  static async #onAdd(this: PoiScenePanel): Promise<void> {
    if (!game.user?.isGM) return;
    const picker = openPoiPicker({ purpose: "scene" });
    const selection = await picker.result;
    if (!selection) return;
    await this.#mutate({ action: "add", sceneId: this.#sceneId, itemUuid: selection.itemUuid });
  }

  async #showUsers(uuid: string): Promise<void> {
    const current = worldPoi(uuid);
    const visibility = current ? readPoiVisibility(current) : null;
    const users = await openPoiUserRevealDialog(visibility?.mode === "users" ? visibility.users : []);
    if (users) await this.#visibility(uuid, "users", users);
  }

  async #visibility(uuid: string, mode: "hidden" | "everyone" | "users", users: readonly string[]): Promise<void> {
    if (!game.user?.isGM) return;
    await this.#mutate({ action: "visibility", sceneId: this.#sceneId, itemUuid: uuid, mode, users });
  }

  #showMenu(uuid: string, anchor: PoiMenuAnchor): void {
    if (!game.user?.isGM || !this.#result || !("entries" in this.#result)) return;
    const entry = this.#result.entries.find(candidate => candidate.itemUuid === uuid);
    if (!entry) return;
    this.#closeMenu?.();
    const item = worldPoi(uuid);
    const visibility = item ? readPoiVisibility(item).mode : "hidden";
    const entries = poiSceneMenuEntries({ visibility, hasLocation: entry.linkedRegionIds.length > 0,
      linked: entry.linkedRegionIds.length > 0 }, key => game.i18n.localize(key));
    this.#closeMenu = showPoiSceneMenu(anchor, entries, action => { void this.#runMenuAction(uuid, action); });
  }

  async #runMenuAction(uuid: string, action: PoiSceneMenuAction): Promise<void> {
    if (!game.user?.isGM) return;
    try {
      switch (action) {
        case "open": this.#openEntry(uuid); break;
        case "locate": {
          const found = await locatePoiInCurrentScene(this.#sceneId, uuid);
          if (!found) ui.notifications.warn(game.i18n.localize(`${ROOT}.NoLocation`));
          break;
        }
        case "everyone": await this.#visibility(uuid, "everyone", []); break;
        case "users": await this.#showUsers(uuid); break;
        case "hide": await this.#visibility(uuid, "hidden", []); break;
        case "remove": await this.#mutate({ action: "remove", sceneId: this.#sceneId, itemUuid: uuid }); break;
      }
    } catch (error) {
      console.error("ordemparanormal2 | Failed to execute Point of Interest panel action", error);
      ui.notifications.error(game.i18n.localize(`${ROOT}.Failed`));
    }
  }

  async #mutate(input: Parameters<typeof mutatePoi>[0]): Promise<void> {
    try {
      const result = await mutatePoi(input);
      if (!result.ok) ui.notifications.warn(game.i18n.localize(`${ROOT}.${result.reason === "linked" ? "UnlinkFirst" : "Failed"}`));
      await this.refresh();
    } catch {
      ui.notifications.error(game.i18n.localize(`${ROOT}.Failed`));
    }
  }

  protected override _onClose(options: ApplicationClosingOptions): void {
    this.#revision++;
    this.#stop?.();
    this.#stopMenuTriggers?.();
    this.#closeMenu?.();
    open.delete(this.#sceneId);
    super._onClose(options);
  }
}

export function openPoiScenePanel(sceneId: string): void {
  const existing = open.get(sceneId);
  if (existing) { existing.bringToFront(); return; }
  const panel = new PoiScenePanel(sceneId);
  open.set(sceneId, panel);
  void panel.render({ force: true });
}
