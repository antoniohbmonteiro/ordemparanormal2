
import { BETA_MISSION_DATA, BETA_TRACKS, type BetaMissionId } from "../../config/adventure-definitions/playtest-beta";
import { resolveBetaSkill, type BetaSkillOccurrence, type planBetaSkills } from "./playtest-beta-skills";
import { betaSkillReference } from "./parse-playtest-beta";
import { betaDocumentPort, betaSeedFlag, findBetaDocument, type BetaDocument, type BetaTarget } from "../../adapters/foundry/playtest-beta-documents";
import { POI_SCENE_ITEMS_PATH, readScenePoiUuids } from "../../adapters/foundry/points-of-interest/poi-runtime-state";
import type { PreparedBetaAgent } from "./parse-playtest-beta";
import { betaAgentFolder, betaFolderSource, betaPoiFolder, betaThreatFolder, reconcileBetaFolderPlacement,
  type BetaFolderRoute } from "./playtest-beta-folders";
import type { BetaImportOptions } from "./import-playtest-beta";

export type BetaAssetLookup = (mission: BetaMissionId, path: string) => string;
type Guard = () => void;
type Save = (target: BetaTarget, parent?: BetaDocument) => Promise<BetaDocument>;
type ImportAbilities = (agent: PreparedBetaAgent, actor: BetaDocument, save: Save) => Promise<void>;

function escape(value: string) {
  const entities: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" };
  return value.replace(/[&<>"]/gu, character => entities[character]);
}
function paragraphs(value: string) {
  return "<p>" + escape(value).replace(/\n\n/gu, "</p><p>").replace(/\n/gu, "<br>") + "</p>";
}
function rulesPage(name: string, content: string) {
  return { name, type: "text", text: { format: 1, content } };
}

export function createBetaDocumentPlan(options: Pick<BetaImportOptions, "missions" | "maps">, skillsPlan: ReturnType<typeof planBetaSkills>,
  asset: BetaAssetLookup) {
  const { bindings, pending } = skillsPlan;
  const folders = new Map<string, string>();
  const preflight: BetaTarget[] = [];
  const routes: BetaFolderRoute[] = [];
  const folderWarnings: string[] = [];
  const executeSteps: ((save: Save, guard: Guard, importAbilities: ImportAbilities) => Promise<unknown>)[] = [];
  const seen = new Set<string>();

  function add(target: BetaTarget, folder: string | BetaFolderRoute,
    then?: (document: BetaDocument, save: Save, importAbilities: ImportAbilities) => Promise<void>) {
    preflight.push(target);
    const route = typeof folder === "string" ? null : folder;
    if (route) routes.push(route);
    executeSteps.push(async (save, guard, importAbilities) => {
      const folderId = folders.get(target.type + ":" + (typeof folder === "string" ? folder : folder.id));
      if (route && !folderId) throw new Error("Pasta Beta não preparada: " + target.name + ".");
      const source = route && folderId ? betaFolderSource(target, route, folderId)
        : { ...target.source, ...(folderId ? { folder: folderId } : {}) };
      const document = await save({ ...target, source });
      if (route) {
        const warning = await reconcileBetaFolderPlacement(document, target, route, folders, guard);
        if (warning) folderWarnings.push(warning);
      }
      await then?.(document, save, importAbilities);
    });
  }

  function journal(id: string, name: string, folder: string, pages: readonly (ReturnType<typeof rulesPage> | { name: string; type: "image" | "pdf"; src: string })[]) {
    add({ type: "JournalEntry", id, name, source: { ownership: { default: 0 } }, managed: {} }, folder,
      async (parent, save) => {
        for (const [index, page] of pages.entries()) {
          await save({ type: "JournalEntryPage", id: id + ":" + index, name: page.name, source: page,
            managed: page.type === "text" && "text" in page ? { "text.content": page.text.content }
              : "src" in page ? { src: page.src } : {} }, parent);
        }
      });
  }

  function pendingSummary(entries: readonly BetaSkillOccurrence[]) {
    if (!entries.length) return "";
    return "<ul>" + entries.map(entry => "<li>" + escape(entry.document + " · " + entry.source + ", p. " + entry.page
      + " · " + entry.label + " · " + (entry.kind === "die" ? "d" : "DT ") + entry.value) + "</li>").join("") + "</ul>";
  }

  for (const data of options.missions) {
    const { mission } = data;
    const definition = BETA_MISSION_DATA[mission];
    const map = options.maps[mission] ?? definition.defaultMap;
    if (!Object.hasOwn(definition.entries, "Mapas/" + map)) throw new Error("Mapa inválido para " + definition.name + ".");
    const image = asset(mission, "Mapas/" + map);
    const token = (name: string) => asset(mission, "Tokens/" + name + ".png");
    const sheetName = "Fichas de personagens" + (mission === "mission2" ? " — Elite" : "");
    journal("sheets:" + mission, sheetName, mission, [{ name: sheetName, type: "pdf", src: asset(mission, definition.sheet) }]);

    const narrativePages = data.narrative.map(entry => rulesPage(entry.name, entry.text.map(page =>
      "<h2>Página " + page.page + "</h2>" + paragraphs(page.text)).join("")));
    const figures = rulesPage("Figuras da missão", paragraphs(definition.figures));
    const variantNames: string[] = data.threats.flatMap(threat => threat.tokens);
    if (mission === "mission2") variantNames.push("Ellen Trechend");
    journal("mission:" + mission, definition.name, mission, [...narrativePages, figures,
      ...variantNames.map(name => ({ name, type: "image" as const, src: token(name) }))]);

    const handouts = Object.keys(definition.entries).filter(path => path.startsWith("Handouts/"));
    for (const path of handouts) {
      const name = path.slice("Handouts/HANDOUT ".length, -4);
      journal("handout:" + mission + ":" + name, name, mission, [{ name, type: "image", src: asset(mission, path) }]);
    }

    for (const agent of data.agents) {
      const id = "agent:" + agent.id;
      if (seen.has(id)) continue;
      seen.add(id);
      const skills: Record<string, number> = {};
      const customSkills: Record<string, number> = {};
      for (const skill of agent.skills) {
        const resolved = resolveBetaSkill(skill.label, bindings);
        if (!resolved) continue;
        const target = resolved.custom ? customSkills : skills;
        const key = resolved.custom ?? resolved.skill;
        if (Object.hasOwn(target, key)) throw new Error("Resolva os vínculos que apontam à mesma perícia: " + agent.name + ".");
        target[key] = skill.die;
      }

      const img = token("Personagem - " + agent.token);
      const resources = { health: { value: agent.health, max: agent.health },
        determination: { value: agent.determination, max: agent.determination } };
      const patches = (prefix: string, values: Record<string, number>) =>
        Object.fromEntries(Object.entries(values).map(([key, value]) => [prefix + key, value]));
      add({ type: "Actor", id, name: agent.name, source: {
        type: "agent", img, ownership: { default: 0 }, prototypeToken: { texture: { src: img }, actorLink: true },
        system: { level: agent.level, attributes: agent.attributes, skills, customSkills, resources },
      }, managed: { img, "prototypeToken.texture.src": img, "system.level": agent.level,
        "system.resources.health.max": agent.health, "system.resources.determination.max": agent.determination,
        ...patches("system.attributes.", agent.attributes), ...patches("system.skills.", skills),
        ...patches("system.customSkills.", customSkills) } }, betaAgentFolder(agent.page <= 12, mission), async (actor, save, importAbilities) => {
        await importAbilities(agent, actor, save);
        const parentItems = betaDocumentPort("Item", actor);
        const occupation = { type: "Item", id: id + ":vocation", name: agent.vocation } as const;
        if (!parentItems.list().some(item => item.type === "occupation") || findBetaDocument(parentItems, occupation))
          await save({ ...occupation, source: { type: "occupation" }, managed: {} }, actor);
        const equipment = agent.equipment.replace(/\s+/gu, " ").replace(/\.$/u, "")
          .split(/,(?![^()]*\))/u).map(value => value.trim()).filter(Boolean);
        for (const [index, item] of equipment.entries()) {
          const name = item.split(" (")[0];
          const description = item.slice(name.length).trim().replace(/^\(|\)$/gu, "");
          await save({ type: "Item", id: id + ":equipment:" + index, name,
            source: { type: "equipment", system: { category: /arma (corpo a corpo|à distância)/u.test(description) ? "weapon" : "general", description } },
            managed: { "system.description": description } }, actor);
        }
      });
    }

    for (const threat of data.threats) {
      const id = "threat:" + threat.mission + ":" + threat.id;
      if (seen.has(id)) continue;
      seen.add(id);
      const img = token(threat.tokens[0]);
      const specialAbilities = threat.notes ? [{ id: "source-notes", name: "Condução manual", description: paragraphs(threat.notes) }] : [];
      const system = { attributes: threat.attributes, resources: { health: { value: threat.health, max: threat.health } },
        category: threat.category, elements: [threat.element], skills: threat.skills, actions: threat.actions, characteristics: { specialAbilities } };
      add({ type: "Actor", id, name: threat.name,
        source: { type: "threat", img, ownership: { default: 0 }, prototypeToken: { texture: { src: img }, actorLink: false }, system },
        managed: { img, "prototypeToken.texture.src": img, "system.attributes": threat.attributes,
          "system.resources.health.max": threat.health, "system.category": threat.category, "system.elements": system.elements,
          "system.skills": threat.skills, "system.actions": threat.actions, "system.characteristics.specialAbilities": specialAbilities } }, betaThreatFolder(threat.mission));
    }

    for (const poi of data.pois) {
      const ids: string[] = [];
      const information = poi.rows.flatMap(row => {
        const approaches = row.labels.flatMap(label => {
          const reference = betaSkillReference(label)!;
          const id = row.id + ":" + reference.key;
          const resolved = resolveBetaSkill(label, bindings);
          if (!resolved) { ids.push(id); return []; }
          const { skill, specialization } = resolved;
          return [{ skill, ...(specialization ? { specialization } : {}), difficulty: row.difficulty, showDifficultyToPlayers: false }];
        });
        return approaches.length ? [{ id: row.id, content: paragraphs(row.content), approaches, availability: { mode: "always", condition: "" } }] : [];
      });
      const img = poi.image ? asset(mission, "Handouts/HANDOUT " + poi.image + ".jpg") : undefined;
      const gmContext = paragraphs(poi.context || "Consulte a investigação e o enigma nos diários da missão.")
        + pendingSummary(pending.filter(entry => ids.includes(entry.id)));
      const system = { publicDescription: "", gmContext, information };
      add({ type: "Item", id: "poi:" + mission + ":" + poi.id, name: poi.name,
        source: { type: "pointOfInterest", ...(img ? { img } : {}), system, ownership: { default: 0 } },
        managed: { ...(img ? { img } : {}), "system.gmContext": gmContext, "system.information": information } }, betaPoiFolder(mission));
    }

    const references = pending.filter(entry =>
      data.agents.some(agent => agent.name === entry.document) || data.pois.some(poi => poi.name === entry.document));
    journal("review:" + mission, "Revisão de perícias — " + definition.name, mission,
      [rulesPage("Referências de perícia", pendingSummary(references) || "<p>Sem referências para revisão.</p>")]);

    const level: BetaTarget = { type: "Level", id: "level:" + mission, name: definition.scene,
      source: { _id: "defaultLevel0000", background: { src: image } }, managed: { "background.src": image } };
    const scene: BetaTarget = { type: "Scene", id: "scene:" + mission, name: definition.scene, source: {
      width: 4096, height: Math.round(4096 * 8280 / 9930), grid: { type: 0 }, navigation: false,
      initialLevel: level.source._id, levels: [{ name: level.name, ...level.source }],
    }, managed: {} };
    preflight.push(scene);
    executeSteps.push(async (save, guard) => {
      const actorScene = await save({ ...scene, source: { ...scene.source, folder: folders.get("Scene:" + mission),
        levels: [{ name: level.name, ...level.source, flags: { ordemparanormal2: { adventureImport: await betaSeedFlag(level) } } }] } });
      await save(level, actorScene);
      const itemPort = betaDocumentPort("Item");
      const ids = data.pois.map(poi => {
        const doc = findBetaDocument(itemPort, { type: "Item", id: "poi:" + mission + ":" + poi.id, name: poi.name });
        if (!doc) throw new Error("POI Beta indisponível: " + poi.name + ".");
        return doc.uuid;
      });
      const current = readScenePoiUuids(actorScene);
      const next = [...new Set([...current, ...ids])];
      if (next.length > current.length) {
        guard();
        await actorScene.update({ [POI_SCENE_ITEMS_PATH]: foundry.data.operators.ForcedReplacement.create(next) });
        if (next.some(id => !readScenePoiUuids(actorScene as unknown as foundry.documents.Scene).includes(id)))
          throw new Error("Catálogo de POIs Beta não confirmado: " + scene.name + ".");
      }
    });
  }

  const first = options.missions[0];
  if (!first) throw new Error("Selecione ao menos uma missão.");
  add({ type: "Playlist", id: "playlist:shared", name: "Contos da Vigília", source: { mode: -1 }, managed: {} }, "shared",
    async (playlist, save) => {
      for (const [index, name] of BETA_TRACKS.entries()) {
        const path = asset(first.mission, "Músicas/" + name + ".mp3");
        await save({ type: "PlaylistSound", id: "track:" + index, name, source: { path }, managed: { path } }, playlist);
      }
    });

  return { preflight, folders, routes, folderWarnings, async execute(save: Save, guard: Guard, importAbilities: ImportAbilities) {
    for (const execute of executeSteps) { guard(); await execute(save, guard, importAbilities); }
  } };
}
