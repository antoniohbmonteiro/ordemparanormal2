import { afterEach, describe, expect, it, vi } from "vitest";

import translations from "../../../lang/pt-BR.json";
import { openAdventureImportPoiConflictDialog } from "./adventure-import-poi-conflict-dialog";

afterEach(() => vi.unstubAllGlobals());

interface DialogOptions {
  readonly window: { readonly title: string };
  readonly buttons: readonly { readonly action: string; readonly label: string; readonly callback: () => string }[];
}

describe("openAdventureImportPoiConflictDialog", () => {
  it("uses only POI conflict labels and leaves Agent conflict copy unchanged", async () => {
    const wait = vi.fn().mockResolvedValue("preserve");
    vi.stubGlobal("foundry", {
      applications: {
        handlebars: { renderTemplate: vi.fn().mockResolvedValue("<content>") },
        api: { DialogV2: { wait } },
      },
    });

    await expect(openAdventureImportPoiConflictDialog([])).resolves.toBe("preserve");
    const options = wait.mock.calls[0]?.[0] as DialogOptions;
    expect(options.window.title).toBe("ORDEMPARANORMAL2.AdventureImport.PoiConflict.Title");
    expect(options.buttons.map(({ action, label }) => ({ action, label }))).toEqual([
      { action: "preserve", label: "ORDEMPARANORMAL2.AdventureImport.PoiConflict.Preserve" },
      { action: "restore", label: "ORDEMPARANORMAL2.AdventureImport.PoiConflict.Restore" },
    ]);
    expect(JSON.stringify(options)).not.toContain("AgentConflict");

    const { PoiConflict, AgentConflict } = translations.ORDEMPARANORMAL2.AdventureImport;
    expect(PoiConflict.Preserve).toBe("Preservar alterações atuais");
    expect(PoiConflict.Restore).toBe("Reaplicar dados do PDF");
    expect(AgentConflict.Preserve).toBe("Preservar agentes modificados");
    expect(AgentConflict.Restore).toBe("Restaurar dados importados");
  });
});
