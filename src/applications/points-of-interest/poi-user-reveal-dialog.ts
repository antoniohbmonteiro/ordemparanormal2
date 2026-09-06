import { SYSTEM_ID } from "../../config/system-config";
import { listPlayerUsers } from "../../adapters/foundry/users/list-player-users";

const localize = (key: string) => game.i18n.localize(`ORDEMPARANORMAL2.PointOfInterest.Reveal.Dialog.${key}`);

/**
 * Small DialogV2 listing player Users with a checkbox each, pre-checked from
 * `preselected`. Resolves the chosen ids on confirm, or `null` on cancel/dismiss.
 */
export function openPoiUserRevealDialog(
  preselected: readonly string[],
): Promise<readonly string[] | null> {
  return new Promise(resolve => {
    let settled = false;
    const finish = (value: readonly string[] | null) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    const players = listPlayerUsers();
    const chosen = new Set(preselected);

    const content = document.createElement("div");
    content.className = "op2-poi-reveal-dialog";
    const checkboxes: HTMLInputElement[] = [];
    if (players.length === 0) {
      const empty = document.createElement("p");
      empty.textContent = localize("Empty");
      content.append(empty);
    }
    for (const player of players) {
      const row = document.createElement("label");
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.value = player.id;
      checkbox.checked = chosen.has(player.id);
      const name = document.createElement("span");
      name.textContent = player.name;
      row.append(checkbox, name);
      content.append(row);
      checkboxes.push(checkbox);
    }

    // DialogV2 serializes string content; mount our live elements at its render event.
    const container = document.createElement("div");
    const mount = document.createElement("div");
    mount.className = "op2-poi-reveal-dialog-mount";
    container.append(mount);

    const dialog = new foundry.applications.api.DialogV2({
      window: { title: localize("Title") },
      position: { width: 420 },
      content: container,
      buttons: [
        {
          action: "confirm",
          label: localize("Confirm"),
          default: true,
          callback: () => finish(checkboxes.filter(checkbox => checkbox.checked).map(checkbox => checkbox.value)),
        },
        { action: "cancel", label: localize("Cancel") },
      ],
    });
    dialog.addEventListener("render", () => {
      const window = dialog.window as typeof dialog.window & { readonly content: HTMLElement };
      window.content.querySelector(".op2-poi-reveal-dialog-mount")?.replaceWith(content);
    });
    dialog.addEventListener("close", () => finish(null), { once: true });
    void dialog.render({ force: true }).catch(error => {
      console.error(`${SYSTEM_ID} | Failed to render POI reveal dialog`, error);
      finish(null);
    });
  });
}
