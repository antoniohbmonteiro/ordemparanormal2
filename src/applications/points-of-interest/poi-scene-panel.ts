import type { HandlebarsTemplatePart } from "@client/applications/api/handlebars-application.mjs";
import type { HandlebarsRenderOptions } from "@client/applications/api/handlebars-application.mjs";
import type { ApplicationClosingOptions } from "@client/applications/_types.mjs";
import { mutatePoi, requestPoiScene, subscribePoiInvalidation, type PoiSceneResult } from "../../adapters/foundry/points-of-interest/poi-runtime-queries";
import { associatedRegionIds, readPoiVisibility, readScenePoiUuids, worldPoi } from "../../adapters/foundry/points-of-interest/poi-runtime-state";
import { countPoiVisibleLocations, hasPoiVisibleLocation, locatePoiInCurrentScene } from "../../adapters/foundry/points-of-interest/poi-scene-locator";
import { openPoiPicker } from "./poi-picker";
import { openPoiUserRevealDialog } from "./poi-user-reveal-dialog";
import { openInvestigationApplication } from "./investigation-application";
import { openInvestigationControl } from "./investigation-control";
import { listenPoiSceneMenuTriggers, poiSceneMenuEntries, showPoiSceneMenu, type PoiSceneMenuAction, type PoiMenuAnchor } from "./poi-scene-panel-menu";
import { filterPoiSceneEntries, poiSceneRowView } from "./poi-scene-panel-view";
import { listenPoiScenePanelDrop } from "./poi-scene-panel-drop";
import { resolveSceneInvestigationAgent } from "../../adapters/foundry/points-of-interest/resolve-investigation-agent";
import { requestInvestigationAction } from "../../adapters/foundry/points-of-interest/investigation-requests";
import { skillLabel, isSkillKey } from "../../config/skills";
import type { ShareClueReference } from "../../adapters/foundry/points-of-interest/investigation-share";

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
      control: PoiScenePanel.#onControl,
      toggle: PoiScenePanel.#onToggle,
      recap: PoiScenePanel.#onRecap,
      share: PoiScenePanel.#onShare,
    },
  };
  static override PARTS: Record<string, HandlebarsTemplatePart> = {
    main: { template: "systems/ordemparanormal2/templates/points-of-interest/poi-scene-panel.hbs" },
  };
  readonly #sceneId: string;
  #result: PoiSceneResult | null = null;
  #stop: (() => void) | null = null;
  #stopMenuTriggers: (() => void) | null = null;
  #stopDrop: (() => void) | null = null;
  #stopSearch: (() => void) | null = null;
  #search = "";
  #closeMenu: (() => void) | null = null;
  #revision = 0;
  #expanded = new Set<string>();
  #actorUuid: string | null = null;
  #resultActorUuid: string | null = null;
  #controlTokenHook: number | null = null;
  #updateUserHook: number | null = null;

  constructor(sceneId: string) {
    const sceneName = game.scenes.get(sceneId)?.name;
    const title = game.i18n.localize(`${ROOT}.Title`);
    super({ id: `op2-poi-scene-${sceneId}`, window: { title: sceneName ? `${title} – ${sceneName}` : title } });
    this.#sceneId = sceneId;
  }

  protected override async _prepareContext(): Promise<Record<string, unknown>> {
    const scene = game.scenes.get(this.#sceneId);
    const isGM = !!game.user?.isGM;
    if (!isGM && this.#result && (resolveSceneInvestigationAgent(this.#sceneId)?.uuid ?? null) !== this.#resultActorUuid) {
      this.#result = null;
      queueMicrotask(() => { void this.refresh(); });
    }
    const projected = this.#result && "entries" in this.#result ? this.#result.entries : [];
    const matches = new Set(filterPoiSceneEntries(projected, this.#search).map(entry => entry.itemUuid));
    const allowed = new Map(projected.map(entry => [entry.itemUuid, entry.name]));
    const entries = projected.map(entry => {
      let clueIndex = 0;
      const item = isGM ? worldPoi(entry.itemUuid) : null;
      const count = isGM ? (scene ? associatedRegionIds(scene, entry.itemUuid).length : 0)
        : countPoiVisibleLocations(this.#sceneId, entry.itemUuid, allowed);
      return { ...poiSceneRowView(entry, item ? readPoiVisibility(item) : null, count, key => game.i18n.localize(key), isGM ? "gm" : "player"),
        matchesSearch: matches.has(entry.itemUuid),
        expanded: this.#expanded.has(entry.itemUuid),
        knownGroups: entry.knownGroups?.map(group => ({ ...group, label: isSkillKey(group.skill) ? skillLabel(group.skill) : group.skill,
          clues: group.clues.map(clue => ({ ...clue, index: clueIndex++ })) })) ?? [] };
    });
    return {
      sceneName: scene?.name ?? "",
      isGM: !!game.user?.isGM,
      loading: this.#result === null,
      error: this.#result && "error" in this.#result,
      entries,
      search: this.#search,
      noSearchResults: !!this.#search.trim() && matches.size === 0,
      empty: !this.#search.trim() && entries.length === 0,
      count: entries.length,
      countLabel: game.i18n.localize(`${ROOT}.${entries.length === 1 ? "CountOne" : "CountMany"}`),
      runActive: !!(this.#result && "entries" in this.#result && this.#result.runId),
      recapAvailable: !!(this.#result && "entries" in this.#result && this.#result.recapAvailable),
      shareAvailable: !!(this.#result && "entries" in this.#result && this.#result.shareAvailable),
      narrativeClues: this.#result && "entries" in this.#result ? this.#result.narrativeClues ?? [] : [],
    };
  }

  protected override _attachPartListeners(partId: string, element: HTMLElement, options: HandlebarsRenderOptions): void {
    super._attachPartListeners(partId, element, options);
    this.#closeMenu?.();
    this.#stopMenuTriggers?.();
    this.#stopDrop?.();
    this.#stopSearch?.();
    if (partId !== "main") return;
    const search = element.querySelector<HTMLInputElement>('input[name="search"]');
    if (search) {
      const onInput = () => {
        this.#search = search.value;
        this.#applySearch(element);
      };
      search.addEventListener("input", onInput);
      this.#stopSearch = () => search.removeEventListener("input", onInput);
    }
    this.#stopMenuTriggers = listenPoiSceneMenuTriggers(element, (uuid, anchor) => this.#showMenu(uuid, anchor));
    if (!game.user?.isGM) return;
    this.#stopDrop = listenPoiScenePanelDrop(element, this.#sceneId,
      uuid => this.#addItem(uuid),
      () => ui.notifications.info(game.i18n.localize(`${ROOT}.AlreadyInScene`)));
  }

  #applySearch(element: HTMLElement): void {
    const entries = this.#result && "entries" in this.#result ? this.#result.entries : [];
    const matches = new Set(filterPoiSceneEntries(entries, this.#search).map(entry => entry.itemUuid));
    for (const row of element.querySelectorAll<HTMLElement>(".op2-poi-scene-panel__row")) {
      row.hidden = !matches.has(row.dataset.itemUuid ?? "");
    }
    const noMatches = element.querySelector<HTMLElement>("[data-poi-search-empty]");
    if (noMatches) noMatches.hidden = !this.#search.trim() || matches.size > 0;
    const empty = element.querySelector<HTMLElement>("[data-poi-scene-empty]");
    if (empty) empty.hidden = !!this.#search.trim() || entries.length > 0;
  }

  protected override async _onFirstRender(context: object, options: object): Promise<void> {
    await super._onFirstRender(context, options as never);
    this.#stop = subscribePoiInvalidation(() => { void this.refresh(); });
    if (!game.user?.isGM) {
      this.#controlTokenHook = Hooks.on("controlToken", () => { void this.refresh(); });
      this.#updateUserHook = Hooks.on("updateUser", (user: unknown) => {
        if (user && typeof user === "object" && "id" in user && user.id === game.user?.id) void this.refresh();
      });
    }
    void this.refresh();
  }

  async refresh(): Promise<void> {
    const revision = ++this.#revision;
    this.#result = null;
    void this.render();
    const actor = resolveSceneInvestigationAgent(this.#sceneId);
    this.#actorUuid = actor?.uuid ?? null;
    const requestedActorUuid = this.#actorUuid;
    const result = await requestPoiScene(this.#sceneId, requestedActorUuid ?? undefined);
    if (revision !== this.#revision) return;
    this.#result = result;
    this.#resultActorUuid = requestedActorUuid;
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
    const scene = game.scenes.get(this.#sceneId);
    const picker = openPoiPicker({ purpose: "scene", excludeItemUuids: scene ? readScenePoiUuids(scene) : [] });
    const selection = await picker.result;
    if (!selection) return;
    await this.#addItem(selection.itemUuid);
  }

  static #onControl(this: PoiScenePanel): void {
    if (game.user?.isGM) openInvestigationControl(this.#sceneId);
  }

  static async #onToggle(this: PoiScenePanel, _event: PointerEvent, target: HTMLElement): Promise<void> {
    const uuid = PoiScenePanel.#entry.call(this, target);
    if (!uuid || game.user?.isGM) return;
    if (this.#expanded.has(uuid)) this.#expanded.delete(uuid);
    else this.#expanded.add(uuid);
    await this.render();
  }

  static async #onRecap(this: PoiScenePanel): Promise<void> {
    const result = this.#result && "entries" in this.#result ? this.#result : null;
    if (!result?.runId || !result.recapAvailable || !this.#actorUuid
      || resolveSceneInvestigationAgent(this.#sceneId)?.uuid !== this.#actorUuid) return;
    const actorUuid = this.#actorUuid;
    const root = "ORDEMPARANORMAL2.PointOfInterest.Investigation";
    const confirmed = await foundry.applications.api.DialogV2.input<boolean>({
      classes: ["ordemparanormal2", "op2-investigation"], modal: true,
      content: `<div class="op2-investigation-recap-prompt"><p>${game.i18n.localize(`${root}.RecapPrompt`)}</p><p>${game.i18n.localize(`${root}.RecapExplanation`)}</p></div>`,
      ok: { action: "send", label: `${root}.RequestRecap`, default: true, callback: () => true },
      position: { width: 460 }, rejectClose: false,
      window: { title: game.i18n.localize(`${root}.Recap`) },
    });
    if (!confirmed || resolveSceneInvestigationAgent(this.#sceneId)?.uuid !== actorUuid) return;
    const sent = await requestInvestigationAction({ kind: "recap", sceneId: this.#sceneId,
      runId: result.runId, actorUuid });
    ui.notifications[sent.ok ? "info" : "error"](game.i18n.localize(`${root}.${sent.ok ? "RequestSent" : "RequestFailed"}`));
  }

  static async #onShare(this: PoiScenePanel, _event: PointerEvent, target: HTMLElement): Promise<void> {
    const result = this.#result && "entries" in this.#result ? this.#result : null;
    if (!result?.runId || !result.shareAvailable || !this.#actorUuid
      || resolveSceneInvestigationAgent(this.#sceneId)?.uuid !== this.#actorUuid) return;
    const actorUuid = this.#actorUuid;
    const uuid = target.closest<HTMLElement>("[data-item-uuid]")?.dataset.itemUuid;
    const index = Number(target.dataset.clueIndex);
    const clues = uuid === "narrative" ? result.narrativeClues
      : result.entries.find(entry => entry.itemUuid === uuid)?.knownGroups?.flatMap(group => group.clues);
    const clue = Number.isInteger(index) ? clues?.[index] : null;
    if (!clue?.shareReference) return;
    const receivers = (result.participants ?? []).filter(candidate => candidate.uuid !== actorUuid);
    if (!receivers.length) return;
    const root = "ORDEMPARANORMAL2.PointOfInterest.Investigation";
    const preview = document.createElement("p");
    preview.className = "op2-investigation-share-preview";
    preview.textContent = clue.text;
    const options = receivers.map(receiver => {
      const option = document.createElement("option");
      option.value = receiver.uuid;
      option.textContent = receiver.name;
      return option.outerHTML;
    }).join("");
    const receiverUuid = await foundry.applications.api.DialogV2.input<string | null>({
      classes: ["ordemparanormal2", "op2-investigation"], modal: true,
      content: `${preview.outerHTML}<label>${game.i18n.localize(`${root}.ShareReceiver`)}<select name="receiver">${options}</select></label>`,
      ok: { action: "send", label: `${root}.Share`, default: true,
        callback: (_event, button) => {
          const field = button.form?.elements.namedItem("receiver");
          return field instanceof HTMLSelectElement ? field.value : null;
        } },
      position: { width: 360 }, rejectClose: false,
      window: { title: game.i18n.localize(`${root}.Share`) },
    });
    if (!receiverUuid || !receivers.some(receiver => receiver.uuid === receiverUuid)
      || resolveSceneInvestigationAgent(this.#sceneId)?.uuid !== actorUuid) return;
    const sent = await requestInvestigationAction({ kind: "share", sceneId: this.#sceneId, runId: result.runId,
      actorUuid, receiverActorUuid: receiverUuid, clue: clue.shareReference as ShareClueReference });
    ui.notifications[sent.ok ? "info" : "error"](game.i18n.localize(`${root}.${sent.ok ? "RequestSent" : "RequestFailed"}`));
    if (sent.ok) await this.refresh();
  }

  async #addItem(itemUuid: string): Promise<void> {
    await this.#mutate({ action: "add", sceneId: this.#sceneId, itemUuid });
  }

  async #showUsers(uuid: string): Promise<void> {
    const current = worldPoi(uuid);
    const visibility = current ? readPoiVisibility(current) : null;
    const users = await openPoiUserRevealDialog(visibility?.mode === "users" ? visibility.users : [], this.#sceneId);
    if (users) await this.#visibility(uuid, "users", users);
  }

  async #visibility(uuid: string, mode: "hidden" | "everyone" | "users", users: readonly string[]): Promise<void> {
    if (!game.user?.isGM) return;
    await this.#mutate({ action: "visibility", sceneId: this.#sceneId, itemUuid: uuid, mode, users });
  }

  #showMenu(uuid: string, anchor: PoiMenuAnchor): void {
    if (!this.#result || !("entries" in this.#result)) return;
    const entry = this.#result.entries.find(candidate => candidate.itemUuid === uuid);
    if (!entry) return;
    this.#closeMenu?.();
    const isGM = !!game.user?.isGM;
    const item = isGM ? worldPoi(uuid) : null;
    const visibility = item ? readPoiVisibility(item).mode : "hidden";
    const allowed = new Map(this.#result.entries.map(candidate => [candidate.itemUuid, candidate.name]));
    const hasLocation = isGM ? entry.linkedRegionIds.length > 0 : hasPoiVisibleLocation(this.#sceneId, uuid, allowed);
    const entries = poiSceneMenuEntries({ isGM, visibility, hasLocation,
      linked: entry.linkedRegionIds.length > 0 }, key => game.i18n.localize(key));
    this.#closeMenu = showPoiSceneMenu(anchor, entries, action => { void this.#runMenuAction(uuid, action); });
  }

  async #runMenuAction(uuid: string, action: PoiSceneMenuAction): Promise<void> {
    if (!game.user?.isGM) {
      if (!this.#result || !("entries" in this.#result)
        || !this.#result.entries.some(entry => entry.itemUuid === uuid)
        || (action !== "open" && action !== "locate")) return;
    }
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
    if (this.#controlTokenHook !== null) Hooks.off("controlToken", this.#controlTokenHook);
    if (this.#updateUserHook !== null) Hooks.off("updateUser", this.#updateUserHook);
    this.#stopMenuTriggers?.();
    this.#stopDrop?.();
    this.#stopSearch?.();
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
