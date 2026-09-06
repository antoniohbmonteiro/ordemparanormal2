import { POINT_OF_INTEREST_ITEM_TYPE, SYSTEM_ID } from "../../../config/system-config";
import { openPoiUserRevealDialog } from "../../../applications/points-of-interest/poi-user-reveal-dialog";
import { listPlayerUsers } from "../users/list-player-users";
import { applyPoiRegionReveal, type ApplyPoiRegionRevealInput } from "./apply-poi-region-reveal";
import type { PoiActionTarget } from "./poi-canvas-session";
import type { PoiPoint } from "./poi-canvas-regions";
import { publishPoiRevealNotice } from "./publish-poi-reveal-notice";
import { readPoiRegionReveal } from "./poi-region-reveal";

interface RevealRegion {
  update(data: Record<string, unknown>): Promise<unknown>;
  getFlag(scope: string, key: string): unknown;
}

export interface PoiActionsMenuDeps {
  resolveRegion(regionId: string): RevealRegion | null;
  openItem(itemUuid: string): Promise<void>;
  applyReveal(region: RevealRegion, input: ApplyPoiRegionRevealInput): Promise<void>;
  pickUsers(preselected: readonly string[]): Promise<readonly string[] | null>;
  mount: { append(node: unknown): void };
  dismiss: EventTarget;
}

const localize = (key: string) => game.i18n.localize(`ORDEMPARANORMAL2.PointOfInterest.Reveal.${key}`);

let closeOpenMenu: (() => void) | null = null;

async function openAssociatedItem(itemUuid: string): Promise<void> {
  try {
    const item = (await fromUuid(itemUuid)) as
      | { readonly type?: string; readonly sheet?: { render(force: boolean): unknown } }
      | null;
    if (!item || item.type !== POINT_OF_INTEREST_ITEM_TYPE || !item.sheet) {
      ui.notifications.warn(localize("Unavailable"));
      return;
    }
    item.sheet.render(true);
  } catch (error) {
    console.error(`${SYSTEM_ID} | Failed to open POI Item`, error);
    ui.notifications.warn(localize("Unavailable"));
  }
}

function applyRevealWithNotice(region: RevealRegion, input: ApplyPoiRegionRevealInput): Promise<void> {
  return applyPoiRegionReveal(region, input, {
    listPlayerUserIds: () => listPlayerUsers().map(user => user.id),
    publishNotice: publishPoiRevealNotice,
  }).catch(error => {
    console.error(`${SYSTEM_ID} | Failed to update POI visibility`, error);
    ui.notifications.error(localize("Failed"));
  });
}

function resolveSceneRegion(regionId: string): RevealRegion | null {
  const scene = (globalThis as {
    canvas?: { scene?: { regions?: { get(id: string): unknown } } | null };
  }).canvas?.scene;
  return (scene?.regions?.get(regionId) as RevealRegion | undefined) ?? null;
}

export function defaultPoiActionsMenuDeps(): PoiActionsMenuDeps {
  return {
    resolveRegion: resolveSceneRegion,
    openItem: openAssociatedItem,
    applyReveal: applyRevealWithNotice,
    pickUsers: openPoiUserRevealDialog,
    mount: document.body,
    dismiss: window,
  };
}

/**
 * Small floating actions menu for one POI, anchored at the pointer. Owns nothing
 * about reveal semantics — every action delegates to the existing use-cases.
 */
export function openPoiActionsMenu(
  target: PoiActionTarget,
  position: PoiPoint,
  deps: PoiActionsMenuDeps = defaultPoiActionsMenuDeps(),
): void {
  closeOpenMenu?.();

  const menu = document.createElement("nav");
  menu.className = "op2-poi-actions-menu";
  menu.style.position = "fixed";
  menu.style.left = `${position.x}px`;
  menu.style.top = `${position.y}px`;

  const title = document.createElement("p");
  title.className = "op2-poi-actions-menu__title";
  title.textContent = target.name;
  menu.append(title);

  let closed = false;
  const onDismiss = (event: Event) => {
    const node = event.target as Node | null;
    if (!node || !menu.contains(node)) close();
  };
  const onKey = (event: Event) => {
    if ((event as KeyboardEvent).key === "Escape") close();
  };
  function close(): void {
    if (closed) return;
    closed = true;
    closeOpenMenu = null;
    deps.dismiss.removeEventListener("pointerdown", onDismiss, true);
    deps.dismiss.removeEventListener("keydown", onKey, true);
    deps.dismiss.removeEventListener("blur", close);
    menu.remove();
  }
  closeOpenMenu = close;

  const withRegion = (run: (region: RevealRegion) => void) => {
    close();
    const region = deps.resolveRegion(target.regionId);
    if (region) run(region);
  };

  const button = (key: string, run: () => void) => {
    const element = document.createElement("button");
    element.type = "button";
    element.textContent = localize(key);
    element.addEventListener("click", run);
    menu.append(element);
  };

  button("Menu.Open", () => {
    close();
    void deps.openItem(target.itemUuid);
  });
  button("Menu.Everyone", () => withRegion(region => {
    void deps.applyReveal(region, { mode: "everyone", users: [] });
  }));
  button("Menu.Users", () => withRegion(region => {
    const reveal = readPoiRegionReveal(region);
    const preselected = reveal.mode === "users" ? reveal.users : [];
    void deps.pickUsers(preselected).then(users => {
      if (users) void deps.applyReveal(region, { mode: "users", users });
    });
  }));
  button("Menu.Hide", () => withRegion(region => {
    void deps.applyReveal(region, { mode: "hidden", users: [] });
  }));

  deps.dismiss.addEventListener("pointerdown", onDismiss, true);
  deps.dismiss.addEventListener("keydown", onKey, true);
  deps.dismiss.addEventListener("blur", close);
  deps.mount.append(menu);
}
