import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { afterEach, expect, it, vi } from "vitest";

const { requestControl, grant, create } = vi.hoisted(() => ({ requestControl: vi.fn(), grant: vi.fn(), create: vi.fn() }));
vi.mock("../../adapters/foundry/points-of-interest/investigation-runtime", () => ({
  requestInvestigationControl: requestControl, mutateInvestigationRuntime: vi.fn(),
}));
vi.mock("../../adapters/foundry/points-of-interest/poi-runtime-queries", () => ({ subscribePoiInvalidation: () => () => undefined }));
vi.mock("./investigation-clue-dialog", () => ({ openPendingShareClueGrant: grant,
  openCreateInvestigationClueDialog: create }));
vi.stubGlobal("foundry", { applications: { api: {
  ApplicationV2: class { render = vi.fn(async () => undefined); }, HandlebarsApplicationMixin: (base: unknown) => base,
} } });
const { InvestigationControl } = await import("./investigation-control");
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

it("keeps character actions informational in GM Control while retaining narrative clue creation", async () => {
  const actions = InvestigationControl.DEFAULT_OPTIONS.actions;
  expect(actions).not.toHaveProperty("recap");
  expect(actions).not.toHaveProperty("share");
  expect(actions).toHaveProperty("createClue");
  expect(actions).toHaveProperty("grantShareClue");
  const template = await readFile(fileURLToPath(new URL(
    "../../../templates/points-of-interest/investigation-control.hbs", import.meta.url)), "utf8");
  expect(template).not.toMatch(/data-action="(?:recap|share)"/u);
  expect(template).toContain('data-action="createClue"');
  expect(template).toContain("{{#if recapUsed}}");
  expect(template).toContain("{{#if shareUsed}}");
  expect(template).toContain('data-action="grantShareClue"');
  expect(template).toContain("MasterControls");
});

it("shows success owners and pending Share in Control, using the same grant operation as the card", async () => {
  const gm = { id: "gm", isGM: true };
  vi.stubGlobal("game", { user: gm, users: { activeGM: gm }, scenes: { get: () => ({ name: "Porão" }) },
    i18n: { localize: (key: string) => key } });
  requestControl.mockResolvedValue({ runtime: { runId: "run", round: 1, actedAgentUuids: [],
    recapSuccessActorUuid: "Actor.a", shareSuccessActorUuid: "Actor.a", shareCluePending: true },
  participants: [{ uuid: "Actor.a", name: "Alan", img: "" }] });
  grant.mockResolvedValue(true);
  const app = new InvestigationControl("scene");
  await app.refresh();
  const context = await (app as unknown as { _prepareContext(): Promise<Record<string, unknown>> })._prepareContext();
  expect(context).toMatchObject({ recapUsed: true, recapUsedBy: "Alan", shareUsed: true,
    shareUsedBy: "Alan", shareCluePending: true, canGrantShareClue: true });
  await InvestigationControl.DEFAULT_OPTIONS.actions.grantShareClue.call(app);
  expect(grant).toHaveBeenCalledExactlyOnceWith("scene", "run");
  await InvestigationControl.DEFAULT_OPTIONS.actions.createClue.call(app);
  expect(create).toHaveBeenCalledExactlyOnceWith("scene", "run");
});
