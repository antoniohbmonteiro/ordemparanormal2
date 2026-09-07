import { afterEach, describe, expect, it, vi } from "vitest";

import { SKILL_DEFINITIONS } from "../../config/skills";
import { selectInvestigationAptitudeSpecialization } from "./investigation-aptitude-selection";

afterEach(() => vi.unstubAllGlobals());

describe("Investigation Aptitude selection", () => {
  it("offers the canonical specializations and returns the selected key", async () => {
    const input = vi.fn().mockResolvedValue("humanities");
    vi.stubGlobal("foundry", { applications: { api: { DialogV2: { input } } } });
    vi.stubGlobal("game", { i18n: { localize: (key: string) => key } });

    await expect(selectInvestigationAptitudeSpecialization())
      .resolves.toBe("humanities");
    const content = input.mock.calls[0]?.[0].content as string;
    const canonical = SKILL_DEFINITIONS.find(({ key }) => key === "aptitude");
    if (!canonical || !("specializations" in canonical)) {
      throw new Error("Missing canonical Aptitude definition.");
    }
    for (const specialization of canonical.specializations) {
      expect(content).toContain(`value="${specialization.key}"`);
      expect(content).toContain(specialization.label);
    }
  });

  it("returns null when the player cancels", async () => {
    vi.stubGlobal("foundry", {
      applications: { api: { DialogV2: { input: vi.fn().mockResolvedValue("cancel") } } },
    });
    vi.stubGlobal("game", { i18n: { localize: (key: string) => key } });
    await expect(selectInvestigationAptitudeSpecialization()).resolves.toBeNull();
  });
});
