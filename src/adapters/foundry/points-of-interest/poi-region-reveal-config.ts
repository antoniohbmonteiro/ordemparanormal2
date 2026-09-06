import { SYSTEM_ID } from "../../../config/system-config";
import { readPoiRegionAssociation } from "./poi-region-association";
import {
  isPoiRegionConfigEligible,
  type PoiRegionConfigDocument,
  type PoiRegionConfigEligibleApp,
} from "./poi-region-config-eligibility";
import {
  readPoiRegionReveal,
  type PoiRegionReveal,
  type PoiRevealMode,
} from "./poi-region-reveal";
import {
  applyPoiRegionReveal,
  type ApplyPoiRegionRevealInput,
} from "./apply-poi-region-reveal";
import { listPlayerUsers } from "../users/list-player-users";
import { publishPoiRevealNotice } from "./publish-poi-reveal-notice";

export interface PoiRegionRevealConfigApplication
  extends Pick<EventTarget, "addEventListener" | "removeEventListener">, PoiRegionConfigEligibleApp {
  readonly document: PoiRegionConfigDocument & {
    update(data: Record<string, unknown>): Promise<unknown>;
  };
}

interface SectionState {
  pendingMode: PoiRevealMode | null;
  pendingUsers: Set<string> | null;
  section?: HTMLElement;
  closeListener: EventListener;
  applying: boolean;
  status?: string;
}

const MODE_LABELS: Record<PoiRevealMode, string> = {
  hidden: "Mode.Hidden",
  everyone: "Mode.Everyone",
  users: "Mode.Users",
};

const states = new WeakMap<PoiRegionRevealConfigApplication, SectionState>();
const localize = (key: string) =>
  game.i18n.localize(`ORDEMPARANORMAL2.PointOfInterest.Reveal.${key}`);

function normalizeMode(value: string): PoiRevealMode {
  return value === "everyone" || value === "users" ? value : "hidden";
}

function sameUserSet(a: Iterable<string>, b: Iterable<string>): boolean {
  const left = new Set(a);
  const right = new Set(b);
  if (left.size !== right.size) return false;
  for (const id of left) if (!right.has(id)) return false;
  return true;
}

function currentInput(
  persisted: PoiRegionReveal,
  state: SectionState,
): ApplyPoiRegionRevealInput {
  const mode = state.pendingMode ?? persisted.mode;
  const users = [...(state.pendingUsers ?? new Set(persisted.users))];
  return { mode, users };
}

function isDirty(persisted: PoiRegionReveal, input: ApplyPoiRegionRevealInput): boolean {
  if (persisted.mode !== input.mode) return true;
  if (input.mode !== "users") return false;
  return !sameUserSet(persisted.users, input.users);
}

function persistedStatus(reveal: PoiRegionReveal): string {
  if (reveal.mode === "everyone") return localize("StatusEveryone");
  if (reveal.mode === "users") {
    return game.i18n.format("ORDEMPARANORMAL2.PointOfInterest.Reveal.StatusUsers", {
      count: reveal.users.length,
    });
  }
  return localize("StatusHidden");
}

function dispose(app: PoiRegionRevealConfigApplication, state: SectionState): void {
  states.delete(app);
  app.removeEventListener("close", state.closeListener);
  state.section?.remove();
}

function render(app: PoiRegionRevealConfigApplication, state: SectionState): void {
  state.section?.remove();

  const persisted = readPoiRegionReveal(app.document);
  const mode = state.pendingMode ?? persisted.mode;
  const selectedUsers = state.pendingUsers ?? new Set(persisted.users);
  const players = listPlayerUsers();

  const section = document.createElement("fieldset");
  section.className = "op2-poi-region-reveal";

  const legend = document.createElement("legend");
  legend.textContent = localize("Title");

  const status = document.createElement("p");
  status.setAttribute("role", "status");
  status.textContent = state.status ?? persistedStatus(persisted);

  const modeField = document.createElement("label");
  modeField.className = "op2-poi-region-reveal__mode";
  const select = document.createElement("select");
  for (const value of ["hidden", "everyone", "users"] as const) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = localize(MODE_LABELS[value]);
    if (value === mode) option.selected = true;
    select.append(option);
  }
  select.value = mode;
  select.addEventListener("change", () => {
    state.pendingMode = normalizeMode(select.value);
    if (state.pendingUsers === null) state.pendingUsers = new Set(persisted.users);
    state.status = undefined;
    render(app, state);
  });
  modeField.append(select);

  section.append(legend, status, modeField);

  const apply = document.createElement("button");
  apply.type = "button";
  apply.textContent = localize("Apply");
  const refreshApply = () => {
    apply.disabled = state.applying || !isDirty(persisted, currentInput(persisted, state));
  };

  if (mode === "users") {
    if (players.length === 0) {
      const empty = document.createElement("p");
      empty.className = "op2-poi-region-reveal__empty";
      empty.textContent = localize("NoPlayers");
      section.append(empty);
    } else {
      const list = document.createElement("div");
      list.className = "op2-poi-region-reveal__users";
      for (const player of players) {
        const row = document.createElement("label");
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.value = player.id;
        checkbox.checked = selectedUsers.has(player.id);
        checkbox.addEventListener("change", () => {
          const users = state.pendingUsers ?? new Set(persisted.users);
          if (checkbox.checked) users.add(player.id);
          else users.delete(player.id);
          state.pendingUsers = users;
          state.status = undefined;
          refreshApply();
        });
        const name = document.createElement("span");
        name.textContent = player.name;
        row.append(checkbox, name);
        list.append(row);
      }
      section.append(list);
    }
  }

  refreshApply();
  apply.addEventListener("click", () => void applyNow(app, state));
  section.append(apply);

  state.section = section;
  app.window.content.append(section);
}

async function applyNow(
  app: PoiRegionRevealConfigApplication,
  state: SectionState,
): Promise<void> {
  if (state.applying) return;
  const persisted = readPoiRegionReveal(app.document);
  const input = currentInput(persisted, state);
  if (!isDirty(persisted, input)) return;

  state.applying = true;
  state.status = undefined;
  render(app, state);

  try {
    await applyPoiRegionReveal(app.document, input, {
      listPlayerUserIds: () => listPlayerUsers().map(user => user.id),
      publishNotice: publishPoiRevealNotice,
    });
    if (states.get(app) !== state) return;
    state.pendingMode = null;
    state.pendingUsers = null;
    state.status = localize("Applied");
  } catch (error) {
    console.error(`${SYSTEM_ID} | Failed to update POI visibility`, error);
    if (states.get(app) !== state) return;
    state.status = localize("ApplyFailed");
  } finally {
    if (states.get(app) === state) {
      state.applying = false;
      render(app, state);
    }
  }
}

/**
 * `renderRegionConfig` hook handler. Injects a "player visibility" fieldset for
 * a GM-editable Region that already has a persisted POI association. Applying a
 * change is immediate (`region.update`), independent of the native submit.
 */
export function renderPoiRegionRevealConfig(value: unknown): void {
  if (!value || typeof value !== "object") return;
  const app = value as PoiRegionRevealConfigApplication;
  if (!app.document || typeof app.document.getFlag !== "function" || !app.window
    || typeof app.addEventListener !== "function") return;

  const state = states.get(app);
  const eligible = isPoiRegionConfigEligible(app)
    && readPoiRegionAssociation(app.document) !== null;
  if (!eligible) {
    if (state) dispose(app, state);
    return;
  }

  let current = state;
  if (!current) {
    const created: SectionState = {
      pendingMode: null,
      pendingUsers: null,
      applying: false,
      closeListener: () => dispose(app, created),
    };
    current = created;
    states.set(app, current);
    app.addEventListener("close", current.closeListener);
  }
  render(app, current);
}
