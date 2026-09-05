import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

interface LanguageDefinition {
  readonly lang: string;
  readonly name: string;
  readonly path: string;
}

interface SystemManifest {
  readonly languages: readonly LanguageDefinition[];
}

describe("system localization manifest", () => {
  it("uses the Brazilian Portuguese dictionary as Foundry's temporary fallback", async () => {
    const manifestPath = fileURLToPath(
      new URL("../../system.json", import.meta.url),
    );
    const manifest = JSON.parse(
      await readFile(manifestPath, "utf8"),
    ) as SystemManifest;

    expect(manifest.languages).toEqual([
      {
        lang: "en",
        name: "English",
        path: "lang/pt-BR.json",
      },
      {
        lang: "pt-BR",
        name: "Português (Brasil)",
        path: "lang/pt-BR.json",
      },
    ]);

    const translationsPath = fileURLToPath(
      new URL(`../../${manifest.languages[0].path}`, import.meta.url),
    );
    const translations = JSON.parse(await readFile(translationsPath, "utf8"));

    expect(translations).toMatchObject({
      TYPES: { Actor: { agent: "Agente" } },
      ORDEMPARANORMAL2: {
        AgentSheet: { Attributes: { Physical: "Físico" } },
        CheckDialog: { Title: "Realizar check" },
      },
    });
  });
});
