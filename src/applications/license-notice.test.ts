import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import {
  COMMUNITY_LICENSE_URL,
  LICENSE_NOTICE_SETTING_KEY,
  LICENSE_NOTICE_VERSION,
  SYSTEM_ID,
} from "../config/system-config";
import {
  shouldShowLicenseNotice,
  showLicenseNoticeIfRequired,
} from "./license-notice";

const EXPECTED_SEAL_PATH =
  "systems/ordemparanormal2/assets/branding/community-license-seal-white.png";

let template = "";
let styles = "";
let readme = "";
let translations: {
  readonly ORDEMPARANORMAL2: {
    readonly LicenseNotice: Record<string, unknown>;
  };
};

beforeAll(async () => {
  const templatePath = fileURLToPath(
    new URL("../../templates/applications/license-notice.hbs", import.meta.url),
  );
  const stylesPath = fileURLToPath(
    new URL("../../styles/license-notice.css", import.meta.url),
  );
  const translationsPath = fileURLToPath(
    new URL("../../lang/pt-BR.json", import.meta.url),
  );
  const readmePath = fileURLToPath(
    new URL("../../README.md", import.meta.url),
  );

  [template, styles, readme, translations] = await Promise.all([
    readFile(templatePath, "utf8"),
    readFile(stylesPath, "utf8"),
    readFile(readmePath, "utf8"),
    readFile(translationsPath, "utf8").then((content) => JSON.parse(content)),
  ]);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

interface PromptOptions {
  readonly ok: {
    readonly callback: (
      event: SubmitEvent,
      button: HTMLButtonElement,
    ) => unknown;
  };
}

function stubRuntime(acceptedVersion: unknown, promptResult: unknown = null) {
  const get = vi.fn().mockReturnValue(acceptedVersion);
  const set = vi.fn().mockResolvedValue(undefined);
  const prompt = vi.fn().mockResolvedValue(promptResult);
  const renderTemplate = vi.fn().mockResolvedValue("notice");
  const error = vi.fn();

  vi.stubGlobal("game", {
    i18n: { localize: (key: string) => key },
    settings: { get, set },
  });
  vi.stubGlobal("foundry", {
    applications: {
      api: { DialogV2: { prompt } },
      handlebars: { renderTemplate },
    },
  });
  vi.stubGlobal("ui", { notifications: { error } });

  return { error, get, prompt, renderTemplate, set };
}

class MockInputElement {
  constructor(readonly checked: boolean) {}
}

function createSubmitButton(checked: boolean): HTMLButtonElement {
  return {
    form: {
      elements: {
        namedItem: (name: string) =>
          name === "doNotShowAgain" ? new MockInputElement(checked) : null,
      },
    },
  } as unknown as HTMLButtonElement;
}

describe("license notice version", () => {
  it("shows for missing or different versions and skips the current version", () => {
    expect(shouldShowLicenseNotice(undefined)).toBe(true);
    expect(shouldShowLicenseNotice("")).toBe(true);
    expect(shouldShowLicenseNotice("0.9")).toBe(true);
    expect(shouldShowLicenseNotice(LICENSE_NOTICE_VERSION)).toBe(false);
  });

  it("does not open a dialog after the current version is accepted", async () => {
    const { prompt } = stubRuntime(LICENSE_NOTICE_VERSION);

    await showLicenseNoticeIfRequired();

    expect(prompt).not.toHaveBeenCalled();
  });
});

describe("license notice confirmation", () => {
  it.each([false, true])(
    "persists only when Entendi is submitted with the checkbox set to %s",
    async (checked) => {
      vi.stubGlobal("HTMLInputElement", MockInputElement);
      const runtime = stubRuntime("");
      runtime.prompt.mockImplementation(async (options: PromptOptions) =>
        options.ok.callback({} as SubmitEvent, createSubmitButton(checked)),
      );

      await showLicenseNoticeIfRequired();

      if (checked) {
        expect(runtime.set).toHaveBeenCalledWith(
          SYSTEM_ID,
          LICENSE_NOTICE_SETTING_KEY,
          LICENSE_NOTICE_VERSION,
        );
      } else {
        expect(runtime.set).not.toHaveBeenCalled();
      }
    },
  );

  it("does not persist when the dialog is dismissed", async () => {
    const { set } = stubRuntime("0.9", null);

    await showLicenseNoticeIfRequired();

    expect(set).not.toHaveBeenCalled();
  });

  it("keeps the preference unaccepted and reports a save failure", async () => {
    const runtime = stubRuntime("0.9", true);
    runtime.set.mockRejectedValue(new Error("storage unavailable"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    await showLicenseNoticeIfRequired();

    expect(runtime.error).toHaveBeenCalledWith(
      "ORDEMPARANORMAL2.LicenseNotice.Errors.SaveFailed",
    );
  });
});

describe("license notice presentation", () => {
  it("renders the official license destination and white seal", async () => {
    const { renderTemplate } = stubRuntime("");

    await showLicenseNoticeIfRequired();

    expect(renderTemplate).toHaveBeenCalledWith(
      "systems/ordemparanormal2/templates/applications/license-notice.hbs",
      {
        licenseUrl: COMMUNITY_LICENSE_URL,
        sealPath: EXPECTED_SEAL_PATH,
      },
    );
    expect(template).toContain('class="op2-license-notice__seal"');
    expect(template).toContain('class="op2-license-notice__ai-warning"');
    expect(template.indexOf("op2-license-notice__ai-warning")).toBeGreaterThan(
      template.indexOf("op2-license-notice__seal"),
    );
  });

  it("keeps the seal at or above ten percent and fully opaque", () => {
    expect(styles).toMatch(/min-width:\s*10%/);
    expect(styles).toMatch(/opacity:\s*1/);
    expect(readme).toMatch(/width="25%"/);
    expect(readme).toMatch(/min-width:\s*10%/);
    expect(readme).toMatch(/opacity:\s*1/);
    expect(readme).toMatch(
      /<\/picture>\s+\*\*Contém material gerado por inteligência artificial\.\*\*/,
    );
  });

  it("contains the required Portuguese notices", () => {
    const notice = translations.ORDEMPARANORMAL2.LicenseNotice;

    expect(notice.Statement).toBe(
      "Este é um conteúdo não oficial, publicado sob a Licença da Comunidade de Ordem Paranormal.",
    );
    expect(notice.NoAffiliation).toBe(
      "Este projeto não possui afiliação, aprovação ou endosso oficial.",
    );
    expect(notice.AiWarning).toBe(
      "Contém material gerado por inteligência artificial.",
    );
    expect(notice.DoNotShowAgain).toBe("Não mostrar novamente");
  });
});
