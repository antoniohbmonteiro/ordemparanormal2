import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";

import { buildAbilityUseDialogView, openAbilityUseDialog } from "./ability-use-dialog";

afterEach(() => vi.unstubAllGlobals());

describe("Ability use dialog", () => {
  it("shows every form, enriches descriptions, and locks only by level", async () => {
    vi.stubGlobal("foundry", {
      applications: { ux: { TextEditor: { implementation: {
        enrichHTML: vi.fn(async (value: string) => `<enriched>${value}</enriched>`),
      } } } },
    });
    vi.stubGlobal("game", {
      i18n: {
        localize: vi.fn((key: string) => key),
        format: vi.fn((_key: string, data: { level: number }) => `Requer nível ${data.level}`),
      },
    });
    const ability = { name: "Ímpeto", isOwner: true } as unknown as foundry.documents.Item;
    const view = await buildAbilityUseDialogView(ability, [
      { id: "d4", name: "Adicionar d4", description: "d4", cost: { source: "resource", amount: 1 }, minimumLevel: 2 },
      { id: "d10", name: "Adicionar d10", description: "d10", cost: { source: "resource", amount: 2 }, minimumLevel: 6 },
      { id: "extra-action", name: "Ação extra", description: "ação", cost: { source: "health", amount: 5 }, minimumLevel: null },
    ], 2, { value: 0, max: 3 });
    expect(view.uses).toHaveLength(3);
    expect(view.uses[0]).toMatchObject({ locked: false, description: "<enriched>d4</enriched>" });
    expect(view.uses[1]).toMatchObject({ locked: true, requirement: "Requer nível 6" });
    expect(view.uses[2]).toMatchObject({ locked: false, costLabel: `5 ORDEMPARANORMAL2.AgentSheet.Resources.Health` });
    expect(view.resource).toEqual({ value: 0, max: 3 });
  });

  it("renders each available form as the direct action without selection controls", async () => {
    const [template, stylesheet] = await Promise.all([
      readFile(
        fileURLToPath(new URL("../../../templates/abilities/ability-use-dialog.hbs", import.meta.url)),
        "utf8",
      ),
      readFile(
        fileURLToPath(new URL("../../../styles/ability-use-dialog.css", import.meta.url)),
        "utf8",
      ),
    ]);
    expect(template).toContain('type="button" data-use-id="{{id}}"');
    expect(template).toContain("{{#if locked}} disabled{{/if}}");
    expect(template).not.toContain('type="radio"');
    expect(template).not.toContain("abilityUseId");
    expect(stylesheet).toContain(
      ".ordemparanormal2.op2-ability-use-dialog .op2-ability-use-dialog__use",
    );
    expect(stylesheet).toContain(
      "height:auto; min-height:0; box-sizing:border-box;",
    );
  });

  it("executes a clicked form and closes only after success", async () => {
    let click: (() => Promise<void>) | undefined;
    const useButton = {
      dataset: { useId: "d4" },
      disabled: false,
      addEventListener: vi.fn((_event: string, listener: () => Promise<void>) => { click = listener; }),
    };
    const close = vi.fn().mockResolvedValue(undefined);
    const wait = vi.fn(async (config: {
      render: (event: Event, dialog: unknown) => void;
      close: () => boolean;
    }) => {
      config.render(new Event("render"), {
        element: { querySelectorAll: () => [useButton] },
        close,
      });
      await click?.();
      return config.close();
    });
    vi.stubGlobal("foundry", {
      applications: {
        api: { DialogV2: { wait } },
        handlebars: { renderTemplate: vi.fn().mockResolvedValue("<section></section>") },
        ux: { TextEditor: { implementation: { enrichHTML: vi.fn(async () => "") } } },
      },
    });
    vi.stubGlobal("game", { i18n: { localize: vi.fn((key: string) => key), format: vi.fn() } });
    const onUse = vi.fn().mockResolvedValue(true);
    const ability = { name: "Ímpeto", isOwner: true } as unknown as foundry.documents.Item;
    await expect(openAbilityUseDialog(ability, [{
      id: "d4", name: "Adicionar d4", description: "",
      cost: { source: "resource", amount: 1 }, minimumLevel: 2,
    }], 2, { value: 0, max: 3 }, onUse)).resolves.toBe(true);
    expect(onUse).toHaveBeenCalledWith("d4");
    expect(close).toHaveBeenCalledOnce();
  });

  it("keeps the dialog open and restores actions after a refused use", async () => {
    let click: (() => Promise<void>) | undefined;
    const useButton = {
      dataset: { useId: "d4" }, disabled: false,
      addEventListener: vi.fn((_event: string, listener: () => Promise<void>) => { click = listener; }),
    };
    const close = vi.fn();
    const wait = vi.fn(async (config: { render: (event: Event, dialog: unknown) => void }) => {
      config.render(new Event("render"), { element: { querySelectorAll: () => [useButton] }, close });
      await click?.();
      return null;
    });
    vi.stubGlobal("foundry", {
      applications: {
        api: { DialogV2: { wait } },
        handlebars: { renderTemplate: vi.fn().mockResolvedValue("<section></section>") },
        ux: { TextEditor: { implementation: { enrichHTML: vi.fn(async () => "") } } },
      },
    });
    vi.stubGlobal("game", { i18n: { localize: vi.fn((key: string) => key), format: vi.fn() } });
    const ability = { name: "Ímpeto", isOwner: true } as unknown as foundry.documents.Item;
    await expect(openAbilityUseDialog(ability, [{
      id: "d4", name: "Adicionar d4", description: "",
      cost: { source: "resource", amount: 1 }, minimumLevel: 2,
    }], 2, { value: 0, max: 3 }, vi.fn().mockResolvedValue(false))).resolves.toBe(false);
    expect(close).not.toHaveBeenCalled();
    expect(useButton.disabled).toBe(false);
  });
});
