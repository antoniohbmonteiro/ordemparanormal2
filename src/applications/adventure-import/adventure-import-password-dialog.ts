const TEMPLATE =
  "systems/ordemparanormal2/templates/applications/adventure-import-password-dialog.hbs";

function readPassword(button: HTMLButtonElement): string {
  const field = button.form?.elements.namedItem("password");
  if (!(field instanceof HTMLInputElement)) throw new Error("Missing Adventure Import password field.");
  return field.value;
}

export async function openAdventureImportPasswordDialog(): Promise<string | null> {
  const content = await foundry.applications.handlebars.renderTemplate(TEMPLATE, {});
  const result = await foundry.applications.api.DialogV2.input<string | "cancel">({
    buttons: [{ action: "cancel", label: "ORDEMPARANORMAL2.AdventureImport.PasswordDialog.Cancel" }],
    classes: ["ordemparanormal2", "op2-adventure-import-password-dialog"],
    content,
    modal: true,
    ok: {
      action: "confirm",
      label: "ORDEMPARANORMAL2.AdventureImport.PasswordDialog.Confirm",
      icon: "fa-solid fa-unlock",
      default: true,
      callback: (_event, button) => readPassword(button),
    },
    position: { width: 420 },
    rejectClose: false,
    window: { title: "ORDEMPARANORMAL2.AdventureImport.PasswordDialog.Title", resizable: false },
  });
  return result === "cancel" || result === "" ? null : result;
}
