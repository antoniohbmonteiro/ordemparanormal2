export async function enrichEquipmentDescription(
  equipment: foundry.documents.Item,
  description: string,
): Promise<string> {
  if (!description.trim()) return "";
  const html = await foundry.applications.ux.TextEditor.implementation.enrichHTML(
    description, { relativeTo: equipment, secrets: equipment.isOwner },
  );
  const template = document.createElement("template");
  template.innerHTML = html;
  return template.content.textContent?.trim() ||
    template.content.querySelector("img, svg, video, audio, iframe, hr")
    ? html : "";
}
