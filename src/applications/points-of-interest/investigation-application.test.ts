import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { afterEach, expect, it, vi } from "vitest";

vi.stubGlobal("foundry", { applications: { api: { ApplicationV2: class {}, HandlebarsApplicationMixin: (base: unknown) => base } } });
const { buildInvestigationRenderContext, investigationApplicationKey, openInvestigationApplication, releaseInvestigationApplication } = await import("./investigation-application");
afterEach(() => vi.unstubAllGlobals());

it("keys one window by World Item and updates its Scene context on reopen", () => {
  const render = vi.fn(); const bringToFront = vi.fn(); const updateContext = vi.fn();
  const create = vi.fn(() => ({ render, bringToFront, updateContext, refresh: vi.fn() }));
  const first = { sceneId: "first", itemUuid: "Item.poi", name: "POI" };
  const second = { ...first, sceneId: "second" };
  expect(investigationApplicationKey(first.itemUuid)).toBe("Item.poi");
  openInvestigationApplication(first, create);
  openInvestigationApplication(second, create);
  expect(create).toHaveBeenCalledOnce();
  expect(updateContext).toHaveBeenCalledExactlyOnceWith(second);
  expect(bringToFront).toHaveBeenCalledOnce();
  releaseInvestigationApplication(first.itemUuid);
});

it("renders private content only when supplied by the sanitized player projection", () => {
  const localize = (key: string) => key;
  const agents = [{ uuid: "Actor.a", name: "Agent", selected: true }];
  const context = buildInvestigationRenderContext("POI", { view: {
    audience: "player", name: "POI", description: "Público", img: "", skills: [{ key: "perception", name: "Percepção", publicDifficulties: [], information: [
      { visibility: "hidden", content: "Conhecida" },
    ] }],
  } }, localize, agents);
  expect(context.canExamine).toBe(true);
  expect(context.isPlayer && context.skills[0].rows.map(row => row.content)).toEqual(["Conhecida"]);
});

it("offers Examinar per skill during a run even when no information is known", () => {
  const context = buildInvestigationRenderContext("POI", { view: {
    audience: "player", name: "POI", description: "", img: "", investigationRunId: "run", skills: [
      { key: "perception", name: "Percepção", publicDifficulties: [], information: [] },
      { key: "occultism", name: "Ocultismo", publicDifficulties: [8], information: [{ visibility: "hidden", content: "A" }, { visibility: "public", difficulty: 8, content: "B" }] },
    ],
  } }, key => key, [{ uuid: "Actor.a", name: "Agent", selected: true }]);
  expect(context.isPlayer && context.skills.map(skill => [skill.key, skill.canExamine, skill.informationCount])).toEqual([
    ["perception", true, 1], ["occultism", true, 2],
  ]);
  expect(context.isPlayer && context.skills[1].rows.map(row => [row.difficulty ?? null, row.content ?? null]))
    .toEqual([[null, "A"], [8, "B"]]);
});

it("keeps each known information paired with its own public DT in a visual row", async () => {
  const context = buildInvestigationRenderContext("POI", { view: {
    audience: "player", name: "POI", description: "", img: "", skills: [
      { key: "research", name: "Pesquisar", publicDifficulties: [6, 8, 10], information: [
        { visibility: "public", difficulty: 6, content: "Primeira" },
        { visibility: "public", difficulty: 8, content: "Segunda" },
      ] },
    ],
  } }, key => key);
  expect(context.isPlayer && context.skills[0].rows.map(row => [row.difficulty, row.content ?? "—"]))
    .toEqual([[6, "Primeira"], [8, "Segunda"], [10, "—"]]);
  const template = await readFile(fileURLToPath(new URL(
    "../../../templates/points-of-interest/investigation-application.hbs", import.meta.url)), "utf8");
  expect(template).toContain("{{#each rows}}");
  expect(template).not.toContain("{{#each publicDifficulties}}");
});

it("keeps two Aptitude actions and their public DTs distinct in the Player view model", () => {
  const context = buildInvestigationRenderContext("POI", { view: {
    audience: "player", name: "POI", description: "", img: "", investigationRunId: "run", skills: [
      { key: "aptitude", name: "Aptidão", specialization: "currentAffairs", publicDifficulties: [8], information: [] },
      { key: "aptitude", name: "Aptidão", specialization: "humanities", publicDifficulties: [], information: [] },
    ],
  } }, key => key, [{ uuid: "Actor.a", name: "Agent", selected: true }]);
  expect(context.isPlayer && context.skills.map(skill => [skill.specialization, skill.publicDifficulties, skill.canExamine]))
    .toEqual([["currentAffairs", [8], true], ["humanities", [], true]]);
});

it("marks situational information and its condition in the GM view", () => {
  const context = buildInvestigationRenderContext("POI", { view: {
    audience: "gm", name: "POI", description: "", img: "", itemUuid: "Item.poi", gmContext: "", skills: [
      { key: "perception", name: "Percepção", information: [
        { id: "seen", content: "Visível", difficulty: 6, showDifficultyToPlayers: false, knownCount: 0 },
        { id: "vault", content: "Cofre", difficulty: 8, showDifficultyToPlayers: false, knownCount: 1,
          condition: "Requer ter aberto o freezer." },
      ] },
    ],
  } }, key => key);
  expect(context.isGm && context.skills[0].information.map(row => [row.id, row.isSituational, row.condition, row.revealLabel]))
    .toEqual([["seen", false, "", "Reveal — Percepção"], ["vault", true, "Requer ter aberto o freezer.", "Reveal — Percepção"]]);
});

it("shows an approach's alternative DT to the GM separately from situational availability", async () => {
  const override = { difficulty: 10, condition: "Se escolherem arrombar." };
  const context = buildInvestigationRenderContext("POI", { view: {
    audience: "gm", name: "POI", description: "", img: "", itemUuid: "Item.poi", gmContext: "", skills: [
      { key: "research", name: "Pesquisar", information: [
        { id: "notes", content: "Notas", difficulty: 6, showDifficultyToPlayers: false, knownCount: 0,
          condition: "Requer ter aberto o armário.", difficultyOverride: override },
        { id: "plain", content: "Simples", difficulty: 8, showDifficultyToPlayers: false, knownCount: 0 },
      ] },
    ],
  } }, key => key);
  expect(context.isGm && context.skills[0].information.map(row => [row.difficulty, row.condition, row.difficultyOverride ?? null]))
    .toEqual([[6, "Requer ter aberto o armário.", override], [8, "", null]]);
  const template = await readFile(fileURLToPath(new URL(
    "../../../templates/points-of-interest/investigation-application.hbs", import.meta.url)), "utf8");
  const overrideLine = template.indexOf("{{#if difficultyOverride}}");
  expect(overrideLine).toBeGreaterThan(template.indexOf("{{#if isSituational}}"));
  expect(template.slice(overrideLine, template.indexOf("{{/if}}", overrideLine)))
    .toContain("{{difficultyOverride.difficulty}} · {{difficultyOverride.condition}}");
});
