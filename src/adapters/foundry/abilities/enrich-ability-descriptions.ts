import type { AbilityCardViewModel } from "../../../ui/actor/agent-sheet-view-model";
import type { OwnedAbilityView } from "./owned-abilities";

async function enrichDescription(
  description: string,
  ability: foundry.documents.Item,
): Promise<string> {
  if (!description.trim()) return "";
  const html = await foundry.applications.ux.TextEditor.implementation.enrichHTML(
    description,
    { relativeTo: ability, secrets: ability.isOwner },
  );
  const template = document.createElement("template");
  template.innerHTML = html;
  return template.content.textContent?.trim() ||
    template.content.querySelector("img, svg, video, audio, iframe, hr")
    ? html : "";
}

export async function enrichAbilityDescriptions(
  ability: foundry.documents.Item,
  view: OwnedAbilityView,
): Promise<Pick<AbilityCardViewModel, "descriptionHTML" | "useForms">> {
  const uses = view.useCollection.kind === "valid" && view.useCollection.isMultiple
    ? view.useCollection.uses : [];
  const [descriptionHTML, useForms] = await Promise.all([
    enrichDescription(view.description, ability),
    Promise.all(uses.map(async (use) => ({
      id: use.id,
      name: use.name,
      descriptionHTML: await enrichDescription(use.description, ability),
      isCheckIntegrated: use.checkIntegration !== null,
    }))),
  ]);
  return { descriptionHTML, useForms };
}
