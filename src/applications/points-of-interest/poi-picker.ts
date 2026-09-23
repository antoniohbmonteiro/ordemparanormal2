import { SYSTEM_ID } from "../../config/system-config";
import {
  loadAvailablePois, resolvePoiCatalogSource,
  type PoiCatalogEntry, type PoiSelection,
} from "../../adapters/foundry/points-of-interest/poi-catalog";

export interface PoiPickerHandle {
  readonly result: Promise<PoiSelection | null>;
  close(): Promise<void>;
}
export interface PoiPickerOptions { readonly purpose?: "association" | "scene" }

const localize = (key: string) => game.i18n.localize(`ORDEMPARANORMAL2.PointOfInterest.Picker.${key}`);

export function filterPoiEntries(entries: readonly PoiCatalogEntry[], query: string): readonly PoiCatalogEntry[] {
  const search = query.trim().toLocaleLowerCase("pt-BR");
  return entries.filter(entry => entry.source.kind === "world" && entry.name.toLocaleLowerCase("pt-BR").includes(search));
}

export function openPoiPicker(options: PoiPickerOptions = {}): PoiPickerHandle {
  let finish!: (selection: PoiSelection | null) => void;
  const result = new Promise<PoiSelection | null>(resolve => { finish = resolve; });
  let closed = false;
  let busy = false;
  let entries: readonly PoiCatalogEntry[] = [];
  let selectedKey: string | null = null;
  const content = document.createElement("div");
  content.className = "op2-poi-picker";
  const searchLabel = document.createElement("label");
  searchLabel.className = "op2-poi-picker__search";
  searchLabel.textContent = localize("Search");
  const search = document.createElement("input");
  search.type = "search";
  search.placeholder = localize("Search");
  searchLabel.append(search);
  const list = document.createElement("ul");
  list.className = "op2-poi-picker__list";
  list.setAttribute("aria-label", localize("Selection"));
  const status = document.createElement("p");
  status.setAttribute("role", "status");
  status.className = "op2-poi-picker__status";
  const choose = document.createElement("button");
  choose.type = "button";
  choose.className = "op2-poi-picker__confirm";
  choose.textContent = localize(options.purpose === "scene" ? "SceneChoose" : "Choose");
  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.textContent = localize("Cancel");
  const retry = document.createElement("button");
  retry.type = "button";
  retry.textContent = localize("Retry");
  retry.hidden = true;
  const footer = document.createElement("div");
  footer.className = "op2-poi-picker__footer";
  footer.append(cancel, choose);
  content.append(searchLabel, list, status, retry, footer);

  const refresh = () => {
    const filtered = filterPoiEntries(entries, search.value);
    if (!filtered.some(entry => entry.key === selectedKey)) selectedKey = null;
    list.replaceChildren(...filtered.map(entry => {
      const row = document.createElement("li");
      const button = document.createElement("button");
      button.type = "button";
      button.className = `op2-poi-picker__option${entry.key === selectedKey ? " is-selected" : ""}`;
      button.setAttribute("aria-pressed", String(entry.key === selectedKey));
      const image = document.createElement("img");
      image.src = entry.img;
      image.alt = "";
      const name = document.createElement("span");
      name.textContent = entry.name;
      button.append(image, name);
      button.addEventListener("click", () => { if (!busy) { selectedKey = entry.key; refresh(); } });
      row.append(button);
      return row;
    }));
    choose.disabled = busy || !selectedKey;
    if (!busy) status.textContent = filtered.length ? "" : localize(entries.length ? "NoMatches" : "Empty");
  };
  const load = async () => {
    busy = true;
    retry.hidden = true;
    choose.disabled = true;
    status.textContent = localize("Loading");
    try {
      const loaded = await loadAvailablePois();
      if (closed) return;
      entries = loaded.filter(entry => entry.source.kind === "world");
      busy = false;
      refresh();
    } catch (error) {
      if (closed) return;
      busy = false;
      status.textContent = localize("LoadFailed");
      retry.hidden = false;
      console.error(`${SYSTEM_ID} | Failed to load POI catalog`, error);
    }
  };
  // DialogV2 serializes content; mount our live elements at its public render event.
  const container = document.createElement("div");
  const mount = document.createElement("div");
  mount.className = "op2-poi-picker-mount";
  container.append(mount);
  const dialog = new foundry.applications.api.DialogV2({
    classes: ["ordemparanormal2", "op2-poi-picker-dialog"],
    window: { title: localize(options.purpose === "scene" ? "SceneTitle" : "Title") },
    position: { width: 560 }, content: container, buttons: [],
  });
  dialog.addEventListener("render", () => {
    const window = dialog.window as typeof dialog.window & { readonly content: HTMLElement };
    window.content.querySelector(".op2-poi-picker-mount")?.replaceWith(content);
  });
  dialog.addEventListener("close", () => { closed = true; finish(null); }, { once: true });
  search.addEventListener("input", refresh);
  retry.addEventListener("click", () => { void load(); });
  cancel.addEventListener("click", () => { void dialog.close(); });
  choose.addEventListener("click", () => {
    const entry = entries.find(candidate => candidate.key === selectedKey && candidate.source.kind === "world");
    if (!entry || busy || closed) return;
    busy = true;
    choose.disabled = true;
    void resolvePoiCatalogSource(entry.source).then(async selection => {
      if (closed) return;
      finish(selection);
      await dialog.close();
    }).catch(error => {
      if (closed) return;
      busy = false;
      status.textContent = localize("Unavailable");
      retry.hidden = false;
      console.error(`${SYSTEM_ID} | Failed to resolve POI selection`, error);
    });
  });
  void dialog.render({ force: true }).then(async () => {
    if (closed) await dialog.close();
    else await load();
  }).catch(error => {
    closed = true;
    finish(null);
    console.error(`${SYSTEM_ID} | Failed to render POI picker`, error);
  });
  return {
    result,
    async close() { closed = true; finish(null); await dialog.close(); },
  };
}
