import { SYSTEM_ID } from "../../config/system-config";
import {
  loadAvailablePois, resolvePoiCatalogSource,
  type PoiCatalogEntry, type PoiSelection,
} from "../../adapters/foundry/points-of-interest/poi-catalog";

export interface PoiPickerHandle {
  readonly result: Promise<PoiSelection | null>;
  close(): Promise<void>;
}

const localize = (key: string) => game.i18n.localize(`ORDEMPARANORMAL2.PointOfInterest.Picker.${key}`);

export function filterPoiEntries(entries: readonly PoiCatalogEntry[], query: string): readonly PoiCatalogEntry[] {
  const search = query.trim().toLocaleLowerCase("pt-BR");
  return entries.filter(entry => `${entry.name} ${entry.origin}`.toLocaleLowerCase("pt-BR").includes(search));
}

export function openPoiPicker(): PoiPickerHandle {
  let finish!: (selection: PoiSelection | null) => void;
  const result = new Promise<PoiSelection | null>(resolve => { finish = resolve; });
  let closed = false;
  let busy = false;
  let entries: readonly PoiCatalogEntry[] = [];
  const content = document.createElement("div");
  content.className = "op2-poi-picker";
  const searchLabel = document.createElement("label");
  searchLabel.textContent = localize("Search");
  const search = document.createElement("input");
  search.type = "search";
  searchLabel.append(search);
  const selectionLabel = document.createElement("label");
  selectionLabel.textContent = localize("Selection");
  const select = document.createElement("select");
  select.size = 8;
  selectionLabel.append(select);
  const status = document.createElement("p");
  status.setAttribute("role", "status");
  const choose = document.createElement("button");
  choose.type = "button";
  choose.textContent = localize("Choose");
  const retry = document.createElement("button");
  retry.type = "button";
  retry.textContent = localize("Retry");
  retry.hidden = true;
  content.append(searchLabel, selectionLabel, status, retry, choose);

  const refresh = () => {
    const previous = select.value;
    const filtered = filterPoiEntries(entries, search.value);
    select.replaceChildren(...filtered.map(entry => {
      const option = document.createElement("option");
      option.value = entry.key;
      option.textContent = `${entry.name} — ${entry.origin}`;
      return option;
    }));
    select.value = previous;
    choose.disabled = busy || !select.value;
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
      entries = loaded;
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
    window: { title: localize("Title") }, position: { width: 560 }, content: container,
    buttons: [{ action: "cancel", label: localize("Cancel") }],
  });
  dialog.addEventListener("render", () => {
    const window = dialog.window as typeof dialog.window & { readonly content: HTMLElement };
    window.content.querySelector(".op2-poi-picker-mount")?.replaceWith(content);
  });
  dialog.addEventListener("close", () => { closed = true; finish(null); }, { once: true });
  search.addEventListener("input", refresh);
  select.addEventListener("change", () => { choose.disabled = busy || !select.value; });
  retry.addEventListener("click", () => { void load(); });
  choose.addEventListener("click", () => {
    const entry = entries.find(candidate => candidate.key === select.value);
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
