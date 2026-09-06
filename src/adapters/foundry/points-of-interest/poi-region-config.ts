import { SYSTEM_ID } from "../../../config/system-config";
import { openPoiPicker, type PoiPickerHandle } from "../../../applications/points-of-interest/poi-picker";
import { resolvePoiAssociation, type PoiSelection } from "./poi-catalog";
import {
  POI_REGION_FLAG, buildPoiRegionAssociationUpdate, readPoiRegionAssociation,
  type PoiAssociationDraft,
} from "./poi-region-association";

// RegionConfig is missing from the installed types; only its public surface is used here.
export interface PoiRegionConfigApplication extends Pick<EventTarget, "addEventListener" | "removeEventListener"> {
  readonly document: {
    readonly id: string | null;
    readonly documentName: string;
    readonly parent: { readonly id: string; readonly regions: { get(id: string): unknown } } | null;
    getFlag(scope: string, key: string): unknown;
  };
  readonly isEditable: boolean;
  readonly form: HTMLFormElement | null;
  readonly window: { readonly content: HTMLElement };
}

interface SectionState {
  draft: PoiAssociationDraft;
  selection?: PoiSelection;
  section?: HTMLElement;
  form: HTMLFormElement | null;
  formListener: EventListener;
  closeListener: EventListener;
  picker?: PoiPickerHandle;
  revision: number;
}

const states = new WeakMap<PoiRegionConfigApplication, SectionState>();
const localize = (key: string) => game.i18n.localize(`ORDEMPARANORMAL2.PointOfInterest.RegionConfig.${key}`);

function eligible(app: PoiRegionConfigApplication): boolean {
  const doc = app.document;
  return !!game.user?.isGM && app.isEditable && doc.documentName === "Region"
    && !!doc.id && doc.parent?.regions.get(doc.id) === doc && !!app.form && !!app.window.content;
}

function dispose(app: PoiRegionConfigApplication, state: SectionState): void {
  states.delete(app);
  state.revision++;
  state.form?.removeEventListener("formdata", state.formListener);
  app.removeEventListener("close", state.closeListener);
  state.section?.remove();
  void state.picker?.close();
}

export function renderPoiRegionConfig(value: unknown): void {
  if (!value || typeof value !== "object") return;
  const app = value as PoiRegionConfigApplication;
  if (!app.document || typeof app.document.getFlag !== "function" || !app.window
    || typeof app.addEventListener !== "function") return;
  let state = states.get(app);
  if (!eligible(app)) {
    if (state) dispose(app, state);
    return;
  }
  if (!state) {
    const created: SectionState = {
      draft: { kind: "unchanged" }, form: null, revision: 0,
      closeListener: () => dispose(app, created),
      formListener: event => {
        if (!eligible(app)) return;
        const formData = (event as FormDataEvent).formData;
        if (!(formData instanceof foundry.applications.ux.FormDataExtended)) return;
        // Public FormDataExtended.set accepts typed values, unlike its installed declaration.
        const typedData = formData as unknown as { set(name: string, value: unknown): void };
        for (const [path, value] of Object.entries(buildPoiRegionAssociationUpdate(created.draft))) {
          typedData.set(path, value);
        }
      },
    };
    state = created;
    states.set(app, state);
    app.addEventListener("close", state.closeListener);
  }
  if (state.form !== app.form) {
    state.form?.removeEventListener("formdata", state.formListener);
    state.form = app.form;
    state.form?.addEventListener("formdata", state.formListener);
  }

  const current = state;
  const revision = ++current.revision;
  current.section?.remove();
  const section = document.createElement("fieldset");
  section.className = "op2-poi-region-association";
  const legend = document.createElement("legend");
  legend.textContent = localize("Title");
  const status = document.createElement("p");
  status.setAttribute("role", "status");
  const actions = document.createElement("div");
  actions.className = "op2-poi-region-association__actions";
  const choose = document.createElement("button");
  choose.type = "button";
  choose.textContent = localize("Choose");
  choose.disabled = !!current.picker;
  choose.addEventListener("click", () => {
    if (current.picker || !eligible(app)) return;
    const picker = openPoiPicker();
    current.picker = picker;
    choose.disabled = true;
    void picker.result.then(selection => {
      if (states.get(app) !== current || current.picker !== picker) return;
      current.picker = undefined;
      if (selection) {
        current.selection = selection;
        current.draft = { kind: "associate", association: { itemUuid: selection.itemUuid } };
      }
      renderPoiRegionConfig(app);
    });
  });
  const remove = document.createElement("button");
  remove.type = "button";
  remove.textContent = localize("Remove");
  const raw = app.document.getFlag(SYSTEM_ID, POI_REGION_FLAG);
  remove.disabled = current.draft.kind === "remove"
    || (current.draft.kind === "unchanged" && raw === undefined);
  remove.addEventListener("click", () => {
    if (!eligible(app)) return;
    current.draft = { kind: "remove" };
    current.selection = undefined;
    const picker = current.picker;
    current.picker = undefined;
    void picker?.close();
    renderPoiRegionConfig(app);
  });
  const hint = document.createElement("p");
  hint.className = "op2-poi-region-association__hint";
  hint.textContent = localize(current.draft.kind === "unchanged" ? "SaveHint" : "Pending");
  actions.append(choose, remove);
  section.append(legend, status, actions, hint);
  current.section = section;
  app.window.content.prepend(section);

  if (current.draft.kind === "remove") status.textContent = localize("None");
  else if (current.draft.kind === "associate" && current.selection) {
    status.textContent = `${current.selection.name} — ${current.selection.origin}`;
  } else {
    const association = readPoiRegionAssociation(app.document);
    status.textContent = localize(association ? "Loading" : raw === undefined ? "None" : "Invalid");
    if (association) void resolvePoiAssociation(association.itemUuid).then(selection => {
      if (states.get(app) !== current || current.revision !== revision) return;
      status.textContent = selection ? `${selection.name} — ${selection.origin}` : localize("Unavailable");
    });
  }
}
