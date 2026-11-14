import { SYSTEM_ID } from "../../../config/system-config";
import {
  EMPTY_CUSTOM_SKILL_CATALOG, isCustomSkillId, listCustomSkillOptions, readCustomSkillCatalog, readCustomSkillDefinition,
  type CustomSkillCatalog, type CustomSkillDefinition, type CustomSkillId,
} from "../../../core/actors/custom-skills";

const SETTING = "customSkills";
const QUERY = `${SYSTEM_ID}.saveCustomSkill`;
const DEFAULT = JSON.stringify(EMPTY_CUSTOM_SKILL_CATALOG);
const listeners = new Set<() => void>();
let writes = Promise.resolve<unknown>(undefined);

export function readWorldCustomSkillCatalog(): CustomSkillCatalog | undefined {
  try {
    const raw = typeof game === "undefined" ? undefined : game.settings?.get(SYSTEM_ID, SETTING);
    return raw === undefined ? EMPTY_CUSTOM_SKILL_CATALOG
      : typeof raw === "string" ? readCustomSkillCatalog(JSON.parse(raw)) : undefined;
  } catch {
    return undefined;
  }
}

export function worldCustomSkillOptions() {
  return listCustomSkillOptions(readWorldCustomSkillCatalog() ?? EMPTY_CUSTOM_SKILL_CATALOG);
}

export function subscribeCustomSkills(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function canManageCustomSkills(user = game.user): boolean {
  return !!user?.isGM && user.hasPermission?.("SETTINGS_MODIFY") === true;
}

interface SaveCommand {
  readonly definition: CustomSkillDefinition;
  readonly expectedRevision: number;
}

function save(data: unknown, sender: foundry.documents.User): Promise<CustomSkillId> {
  const pending = writes.catch(() => undefined).then(async () => {
    const users = game.users as typeof game.users & { get(id: string): foundry.documents.User | undefined };
    const requester = users.get(sender.id);
    if (game.users.activeGM?.id !== game.user.id || !canManageCustomSkills(game.user)
      || !requester || !canManageCustomSkills(requester))
      throw new Error("Custom skill catalog write is forbidden.");
    const catalog = readWorldCustomSkillCatalog();
    if (!catalog || !data || typeof data !== "object" || !("definition" in data) || !("expectedRevision" in data))
      throw new Error("Invalid custom skill catalog or command.");
    const definition = readCustomSkillDefinition(data.definition);
    if (!definition || typeof data.expectedRevision !== "number") throw new Error("Invalid custom skill definition.");
    const current = catalog.definitions.find(entry => entry.id === definition.id);
    const next = { ...definition, revision: data.expectedRevision + 1 };
    if (current && current.revision === next.revision && JSON.stringify(current) === JSON.stringify(next)) return current.id;
    if ((current?.revision ?? 0) !== data.expectedRevision || (current && current.kind !== definition.kind))
      throw new Error("Custom skill definition changed.");
    if (current?.kind === "specialized" && next.kind === "specialized"
      && current.specializations.some(entry => !next.specializations.some(candidate => candidate.id === entry.id)))
      throw new Error("Existing specializations must be archived.");
    const candidate = readCustomSkillCatalog({ version: 1, definitions: current
      ? catalog.definitions.map(entry => entry.id === next.id ? next : entry)
      : [...catalog.definitions, next] });
    if (!candidate) throw new Error("Invalid or duplicate custom skill.");
    await game.settings.set(SYSTEM_ID, SETTING, JSON.stringify(candidate));
    return next.id;
  });
  writes = pending;
  return pending;
}

export async function saveWorldCustomSkill(definition: CustomSkillDefinition, expectedRevision: number): Promise<CustomSkillId> {
  if (!canManageCustomSkills()) throw new Error("Custom skill catalog write is forbidden.");
  const active = game.users.activeGM;
  if (!active) throw new Error("No active GM.");
  const command: SaveCommand = { definition, expectedRevision };
  if (active.id === game.user.id) return save(command, game.user);
  const id: unknown = await active.query(QUERY, command);
  if (!isCustomSkillId(id) || id !== definition.id) throw new Error("Unconfirmed custom skill write.");
  return id;
}

export function registerCustomSkillCatalog(): void {
  (CONFIG as typeof CONFIG & { queries: Record<string, unknown> }).queries[QUERY] =
    (data: unknown, context: { readonly user: foundry.documents.User }) => {
      const users = game.users as typeof game.users & { get(id: string): foundry.documents.User | undefined };
      const sender = users.get(context.user.id);
      if (!sender) throw new Error("Unknown custom skill requester.");
      return save(data, sender);
    };
  game.settings.register(SYSTEM_ID, SETTING, {
    name: "Perícias personalizadas",
    config: false,
    scope: "world",
    type: String,
    default: DEFAULT,
    onChange: () => {
      if (!readWorldCustomSkillCatalog() && game.user?.isGM)
        ui.notifications.error("O catálogo de perícias personalizadas está inválido.");
      for (const listener of listeners) {
        try { listener(); }
        catch (error) { console.error("Failed to refresh a custom skill consumer.", error); }
      }
    },
  });
  Hooks.once("ready", () => {
    if (!readWorldCustomSkillCatalog() && game.user?.isGM)
      ui.notifications.error("O catálogo de perícias personalizadas está inválido.");
  });
}
