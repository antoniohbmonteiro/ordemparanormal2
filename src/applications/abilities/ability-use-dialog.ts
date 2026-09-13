import { isAbilityUseAvailable, type AbilityUseData } from "../../core/abilities/ability-use";
import type { AbilityResourceData } from "../../core/abilities/ability-resource";

const TEMPLATE = "systems/ordemparanormal2/templates/abilities/ability-use-dialog.hbs";

interface AbilityUseDialogView {
  readonly abilityName: string;
  readonly hasResource: boolean;
  readonly resource: AbilityResourceData | null;
  readonly uses: readonly {
    readonly id: string;
    readonly name: string;
    readonly description: string;
    readonly hasDescription: boolean;
    readonly costLabel: string;
    readonly locked: boolean;
    readonly requirement: string;
  }[];
}

export async function buildAbilityUseDialogView(
  ability: foundry.documents.Item,
  uses: readonly AbilityUseData[],
  level: number,
  resource: AbilityResourceData | null,
): Promise<AbilityUseDialogView> {
  const descriptions = await Promise.all(uses.map(({ description }) =>
    foundry.applications.ux.TextEditor.implementation.enrichHTML(description, {
      relativeTo: ability,
      secrets: ability.isOwner,
    }),
  ));
  return {
    abilityName: ability.name,
    hasResource: resource !== null,
    resource,
    uses: uses.map((use, index) => {
      const locked = !isAbilityUseAvailable(use, level);
      const costLabel = use.cost.source === "none"
        ? game.i18n.localize("ORDEMPARANORMAL2.AgentSheet.Abilities.NoCost")
        : `${use.cost.amount} ${game.i18n.localize(use.cost.source === "determination"
          ? "ORDEMPARANORMAL2.AgentSheet.Resources.Determination"
          : "ORDEMPARANORMAL2.AgentSheet.Abilities.Resource")}`;
      return {
        id: use.id,
        name: use.name,
        description: descriptions[index] ?? "",
        hasDescription: !!descriptions[index]?.trim(),
        costLabel,
        locked,
        requirement: locked && use.minimumLevel !== null
          ? game.i18n.format("ORDEMPARANORMAL2.AbilityUseDialog.RequiresLevel", { level: use.minimumLevel })
          : "",
      };
    }),
  };
}

export type AbilityUseDialogAction = (useId: string) => Promise<boolean>;

export async function openAbilityUseDialog(
  ability: foundry.documents.Item,
  uses: readonly AbilityUseData[],
  level: number,
  resource: AbilityResourceData | null,
  onUse: AbilityUseDialogAction,
): Promise<boolean> {
  const content = await foundry.applications.handlebars.renderTemplate(
    TEMPLATE,
    await buildAbilityUseDialogView(ability, uses, level, resource),
  );
  let completed = false;
  const result = await foundry.applications.api.DialogV2.wait({
    buttons: [{
      action: "cancel",
      label: "ORDEMPARANORMAL2.AbilityUseDialog.Actions.Cancel",
      type: "button",
      default: true,
    }],
    classes: ["ordemparanormal2", "op2-ability-use-dialog"],
    content,
    modal: true,
    close: () => completed,
    render: (_event, dialog) => {
      const buttons = [
        ...dialog.element.querySelectorAll<HTMLButtonElement>("[data-use-id]"),
      ];
      for (const button of buttons) {
        button.addEventListener("click", async () => {
          const useId = button.dataset.useId;
          if (!useId || button.disabled) return;
          const disabledStates = buttons.map((entry) => entry.disabled);
          for (const entry of buttons) entry.disabled = true;
          try {
            completed = await onUse(useId);
            if (completed) await dialog.close();
          } finally {
            if (!completed) {
              buttons.forEach((entry, index) => {
                entry.disabled = disabledStates[index] ?? true;
              });
            }
          }
        });
      }
    },
    position: { width: 520 },
    window: { title: ability.name },
  });
  return result === true;
}
