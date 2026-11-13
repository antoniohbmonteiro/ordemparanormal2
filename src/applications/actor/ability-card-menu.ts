import type { ContextMenuEntry } from "@client/applications/ux/context-menu.mjs";

export function bindAbilityCardMenu(
  element: HTMLElement,
  canEdit: () => boolean,
  edit: (target: HTMLElement) => void,
  remove: (target: HTMLElement) => Promise<void>,
) {
  const entries: ContextMenuEntry[] = [
    {
      label: game.i18n.localize("ORDEMPARANORMAL2.AgentSheet.Abilities.Edit"),
      icon: '<i class="fa-solid fa-pen"></i>',
      visible: canEdit,
      onClick: (event, target) => {
        event.stopPropagation();
        edit(target);
      },
    },
    {
      label: game.i18n.localize("ORDEMPARANORMAL2.AgentSheet.Abilities.Delete"),
      icon: '<i class="fa-solid fa-trash"></i>',
      classes: "op2-ability-action--delete",
      visible: canEdit,
      onClick: async (event, target) => {
        event.stopPropagation();
        await remove(target);
      },
    },
  ];
  const Menu = foundry.applications.ux.ContextMenu.implementation;
  return new Menu(element, ".op2-ability-card__use", entries, { eventName: "contextmenu", fixed: true, jQuery: false });
}

export function openAbilityCardMenu(event: PointerEvent, target: HTMLElement, exists: (id: string) => boolean): void {
  event.stopPropagation();
  if (event.button !== 0) return;
  const surface = target.closest(".op2-ability-card")?.querySelector<HTMLElement>(".op2-ability-card__use");
  const id = surface?.dataset.itemId;
  if (!surface || !id || !exists(id)) return;
  surface.dispatchEvent(new MouseEvent("contextmenu", {
    bubbles: true, cancelable: true, button: 2,
    clientX: event.detail === 0 ? 0 : event.clientX,
    clientY: event.detail === 0 ? 0 : event.clientY,
  }));
}
