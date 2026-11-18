
import { afterEach, describe, expect, it, vi } from "vitest";
import { PlaytestBetaPanel } from "./playtest-beta-panel";
import { preparePlaytestBeta, type PreparedBetaMission } from "../../features/adventure-import/prepare-playtest-beta";
import { importPlaytestBeta } from "../../features/adventure-import/import-playtest-beta";

vi.mock("../../features/adventure-import/prepare-playtest-beta", () => ({ preparePlaytestBeta: vi.fn() }));
vi.mock("../../features/adventure-import/import-playtest-beta", () => ({
  previewBetaImport: vi.fn(async () => []), importPlaytestBeta: vi.fn(async () => ({ legacy: [], folderWarnings: [] })),
}));
vi.mock("../../adapters/foundry/actors/custom-skill-catalog", () => ({
  canManageCustomSkills: () => true,
  readWorldCustomSkillCatalog: () => ({ version: 1, definitions: [] }),
}));

const render = async () => {};
const conflict = async () => "cancel" as const;
const pdf = new File([], "beta.pdf");
const zip = new File([], "extras.zip");

function createPanel() {
  vi.stubGlobal("game", {
    user: { id: "gm", isGM: true }, users: { activeGM: { id: "gm" } }, i18n: { localize: (key: string) => key },
  });
  return new PlaytestBetaPanel();
}

afterEach(() => { vi.clearAllMocks(); vi.unstubAllGlobals(); });

describe("Playtest Beta detection", () => {
  it("shows no mission controls before analysis and can recognize the PDF alone", async () => {
    const panel = createPanel();
    expect(panel.context()).toMatchObject({ hasAnalysis: false, missions: [], canAnalyze: false, canImport: false });
    panel.files["beta-pdf"] = pdf;
    vi.mocked(preparePlaytestBeta).mockResolvedValue({ detected: [], issues: {} });
    expect(panel.context()).toMatchObject({ hasAnalysis: false, missions: [], canAnalyze: true, canImport: false });
    await panel.run("analyze", render, conflict);
    expect(panel.context()).toMatchObject({
      hasAnalysis: true, canImport: false,
      missions: [{ id: "mission1", ready: false, selected: false }, { id: "mission2", ready: false, selected: false }],
    });
  });

  it("analyzes supplied extras before selection and imports only selected ready missions", async () => {
    const panel = createPanel();
    panel.files["beta-pdf"] = pdf;
    panel.files.mission1 = zip;
    panel.files.mission2 = zip;
    const mission = (id: PreparedBetaMission["mission"]): PreparedBetaMission =>
      ({ mission: id, file: zip, agents: [], pois: [], threats: [], narrative: [] });
    const detected = [mission("mission1"), mission("mission2")];
    vi.mocked(preparePlaytestBeta).mockResolvedValue({ detected, issues: {} });
    await panel.run("analyze", render, conflict);
    expect(preparePlaytestBeta).toHaveBeenCalledWith(pdf, { mission1: zip, mission2: zip });
    expect(panel.context()).toMatchObject({
      canImport: true,
      missions: [{ id: "mission1", ready: true, selected: true }, { id: "mission2", ready: true, selected: true }],
    });
    await panel.toggleMission("mission2", render);
    await panel.run("import", render, conflict);
    expect(importPlaytestBeta).toHaveBeenCalledWith(expect.objectContaining({ missions: [detected[0]] }));
    expect(preparePlaytestBeta).toHaveBeenCalledOnce();
  });
});
