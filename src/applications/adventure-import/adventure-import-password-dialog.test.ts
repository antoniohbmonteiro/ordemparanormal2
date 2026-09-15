import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it, vi } from "vitest";

import { openAdventureImportPasswordDialog } from "./adventure-import-password-dialog";

afterEach(() => vi.unstubAllGlobals());

interface DialogInputOptions {
  readonly buttons: readonly { readonly action: string; readonly label: string }[];
  readonly modal: boolean;
  readonly rejectClose: boolean;
  readonly ok: { readonly callback: (event: unknown, button: HTMLButtonElement) => unknown };
}

function stubDialog(input: ReturnType<typeof vi.fn>): void {
  vi.stubGlobal("foundry", {
    applications: {
      handlebars: { renderTemplate: vi.fn().mockResolvedValue("<content>") },
      api: { DialogV2: { input } },
    },
  });
  vi.stubGlobal("HTMLInputElement", FakeInputElement);
}

class FakeInputElement {
  constructor(public value: string) {}
}

function fakeButton(passwordValue: string): HTMLButtonElement {
  return {
    form: {
      elements: {
        namedItem: (name: string) => (name === "password" ? new FakeInputElement(passwordValue) : null),
      },
    },
  } as unknown as HTMLButtonElement;
}

describe("openAdventureImportPasswordDialog", () => {
  it("resolves with the typed password on confirm", async () => {
    const input = vi.fn(async (options: DialogInputOptions) => options.ok.callback({}, fakeButton("segredo")));
    stubDialog(input);

    await expect(openAdventureImportPasswordDialog()).resolves.toBe("segredo");
    const options = input.mock.calls[0]?.[0] as DialogInputOptions;
    expect(options.rejectClose).toBe(false);
    expect(options.modal).toBe(true);
    expect(options.buttons).toEqual([
      { action: "cancel", label: "ORDEMPARANORMAL2.AdventureImport.PasswordDialog.Cancel" },
    ]);
  });

  it("resolves with null when the dialog is cancelled", async () => {
    stubDialog(vi.fn().mockResolvedValue("cancel"));
    await expect(openAdventureImportPasswordDialog()).resolves.toBeNull();
  });

  it("resolves with null when the password field is left empty", async () => {
    const input = vi.fn(async (options: DialogInputOptions) => options.ok.callback({}, fakeButton("")));
    stubDialog(input);
    await expect(openAdventureImportPasswordDialog()).resolves.toBeNull();
  });

  it("throws if the rendered form is missing the password field", async () => {
    const input = vi.fn(async (options: DialogInputOptions) =>
      options.ok.callback({}, { form: { elements: { namedItem: () => null } } } as unknown as HTMLButtonElement),
    );
    stubDialog(input);
    await expect(openAdventureImportPasswordDialog()).rejects.toThrow();
  });

  it("never uses a legacy read API or persists the password anywhere", async () => {
    const source = await readFile(
      fileURLToPath(new URL("./adventure-import-password-dialog.ts", import.meta.url)),
      "utf8",
    );
    expect(source).not.toMatch(/FileReader|settings\.set|localStorage/);
  });
});
