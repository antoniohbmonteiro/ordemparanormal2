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
    audience: "player", name: "POI", description: "Público", img: "", skills: [{ key: "perception", name: "Percepção", information: [
      { visibility: "hidden", content: "Conhecida" }, { visibility: "hidden" },
    ] }],
  } }, localize, agents);
  expect(context.canExamine).toBe(true);
  expect(context.isPlayer && context.skills[0].information.map(row => row.content)).toEqual(["Conhecida", ""]);
});

it("offers Examinar only for skills that still have undiscovered information", () => {
  const context = buildInvestigationRenderContext("POI", { view: {
    audience: "player", name: "POI", description: "", img: "", skills: [
      { key: "perception", name: "Percepção", information: [{ visibility: "hidden", content: "Conhecida" }, { visibility: "hidden" }] },
      // All known, e.g. an always information and a known situational one: nothing is left to examine.
      { key: "occultism", name: "Ocultismo", information: [{ visibility: "hidden", content: "A" }, { visibility: "public", difficulty: 8, content: "B" }] },
    ],
  } }, key => key, [{ uuid: "Actor.a", name: "Agent", selected: true }]);
  expect(context.isPlayer && context.skills.map(skill => [skill.key, skill.hasUndiscovered])).toEqual([
    ["perception", true], ["occultism", false],
  ]);
});

it("renders Examinar only for examinable skills and the situational mark only from GM rows", async () => {
  const template = await readFile(fileURLToPath(new URL(
    "../../../templates/points-of-interest/investigation-application.hbs", import.meta.url)), "utf8");
  const examine = template.indexOf('data-action="examine"');
  expect(template.lastIndexOf("{{#if ../hasUndiscovered}}", examine)).toBeGreaterThan(template.lastIndexOf("{{/if}}", examine));
  const situational = template.indexOf("{{#if isSituational}}");
  expect(template.indexOf("{{condition}}")).toBeGreaterThan(situational);
  expect(template.indexOf("{{/if}}", situational)).toBeGreaterThan(template.indexOf("{{condition}}"));
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
