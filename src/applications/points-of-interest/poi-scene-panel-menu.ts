export type PoiSceneMenuAction = "open" | "locate" | "everyone" | "users" | "hide" | "remove";
export interface PoiSceneMenuEntry {
  readonly action: PoiSceneMenuAction;
  readonly label: string;
  readonly icon: string;
  readonly group: "navigation" | "visibility" | "membership";
  readonly checked?: boolean;
  readonly disabled?: boolean;
  readonly hint?: string;
}
export interface PoiSceneMenuState {
  readonly visibility: "hidden" | "everyone" | "users";
  readonly hasLocation: boolean;
  readonly linked: boolean;
}
export interface PoiMenuAnchor { readonly x: number; readonly y: number }

const ROOT = "ORDEMPARANORMAL2.PointOfInterest.ScenePanel";

export function poiSceneMenuEntries(state: PoiSceneMenuState, localize: (key: string) => string): readonly PoiSceneMenuEntry[] {
  const label = (key: string) => localize(`${ROOT}.${key}`);
  return [
    { action: "open", label: label("Open"), icon: "fa-folder-open", group: "navigation" },
    { action: "locate", label: label("Locate"), icon: "fa-location-dot", group: "navigation",
      disabled: !state.hasLocation, hint: !state.hasLocation ? label("NoLocation") : undefined },
    { action: "everyone", label: label("ShowEveryone"), icon: "fa-eye", group: "visibility", checked: state.visibility === "everyone" },
    { action: "users", label: label("ShowUsers"), icon: "fa-users", group: "visibility", checked: state.visibility === "users" },
    { action: "hide", label: label("Hide"), icon: "fa-eye-slash", group: "visibility", checked: state.visibility === "hidden" },
    { action: "remove", label: label("Remove"), icon: "fa-trash", group: "membership",
      disabled: state.linked, hint: state.linked ? label("UnlinkFirst") : undefined },
  ];
}

/** Both entry points use the same callback and therefore the same menu/actions. */
export function listenPoiSceneMenuTriggers(
  root: HTMLElement,
  open: (itemUuid: string, anchor: PoiMenuAnchor) => void,
): () => void {
  const rowFor = (target: EventTarget | null): HTMLElement | null => {
    const element = target as HTMLElement | null;
    const row = element?.closest?.<HTMLElement>("[data-item-uuid]") ?? null;
    return row && root.contains(row) && row.dataset.itemUuid ? row : null;
  };
  const onClick = (event: MouseEvent) => {
    const target = event.target as HTMLElement | null;
    const trigger = target?.closest?.<HTMLElement>("[data-poi-menu-trigger]");
    const row = trigger && rowFor(trigger);
    if (!trigger || !row) return;
    const rect = trigger.getBoundingClientRect();
    open(row.dataset.itemUuid!, { x: rect.right, y: rect.bottom });
  };
  const onContext = (event: MouseEvent) => {
    const row = rowFor(event.target);
    if (!row) return;
    event.preventDefault();
    open(row.dataset.itemUuid!, { x: event.clientX, y: event.clientY });
  };
  root.addEventListener("click", onClick);
  root.addEventListener("contextmenu", onContext);
  return () => {
    root.removeEventListener("click", onClick);
    root.removeEventListener("contextmenu", onContext);
  };
}

export function showPoiSceneMenu(
  anchor: PoiMenuAnchor,
  entries: readonly PoiSceneMenuEntry[],
  onSelect: (action: PoiSceneMenuAction) => void,
): () => void {
  const menu = document.createElement("nav");
  menu.className = "op2-poi-scene-menu";
  menu.setAttribute("role", "menu");
  let group: PoiSceneMenuEntry["group"] | null = null;
  for (const entry of entries) {
    if (group && group !== entry.group) {
      const divider = document.createElement("div");
      divider.className = "op2-poi-scene-menu__divider";
      divider.setAttribute("role", "separator");
      menu.append(divider);
    }
    group = entry.group;
    const wrapper = document.createElement("div");
    if (entry.hint) wrapper.title = entry.hint;
    const button = document.createElement("button");
    button.type = "button";
    button.className = `op2-poi-scene-menu__item${entry.action === "remove" ? " is-remove" : ""}`;
    button.setAttribute("role", entry.group === "visibility" ? "menuitemradio" : "menuitem");
    if (entry.group === "visibility") button.setAttribute("aria-checked", String(!!entry.checked));
    button.disabled = !!entry.disabled;
    if (entry.hint) button.setAttribute("aria-description", entry.hint);
    const icon = document.createElement("i");
    icon.className = `fa-solid ${entry.icon}`;
    icon.setAttribute("aria-hidden", "true");
    const label = document.createElement("span");
    label.textContent = entry.label;
    const check = document.createElement("i");
    check.className = entry.checked ? "fa-solid fa-check" : "";
    check.setAttribute("aria-hidden", "true");
    button.append(icon, label, check);
    button.addEventListener("click", () => { close(); onSelect(entry.action); });
    wrapper.append(button);
    menu.append(wrapper);
  }
  document.body.append(menu);
  const bounds = menu.getBoundingClientRect();
  menu.style.left = `${Math.max(8, Math.min(anchor.x, window.innerWidth - bounds.width - 8))}px`;
  menu.style.top = `${Math.max(8, Math.min(anchor.y, window.innerHeight - bounds.height - 8))}px`;
  const outside = (event: PointerEvent) => { if (!menu.contains(event.target as Node)) close(); };
  const keydown = (event: KeyboardEvent) => { if (event.key === "Escape") close(); };
  let closed = false;
  function close(): void {
    if (closed) return;
    closed = true;
    document.removeEventListener("pointerdown", outside, true);
    document.removeEventListener("keydown", keydown, true);
    window.removeEventListener("blur", close);
    menu.remove();
  }
  document.addEventListener("pointerdown", outside, true);
  document.addEventListener("keydown", keydown, true);
  window.addEventListener("blur", close);
  menu.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
  return close;
}
