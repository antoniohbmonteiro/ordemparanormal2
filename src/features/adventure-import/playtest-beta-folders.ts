
import { BETA_ID, BETA_MISSIONS, type BetaMissionId } from "../../config/adventure-definitions/playtest-beta";
import type { BetaDocument, BetaTarget } from "../../adapters/foundry/playtest-beta-documents";
import { ADVENTURE_FOLDER_PLACEMENT_FLAG_PATH, prepareAdventureFolderTree,
  type AdventureFolderFlag, type AdventureFolderNode, type AdventureFolderPort, type AdventureFolderSnapshot,
} from "./adventure-folders";

type OrganizerType = "Actor" | "Item";
type Category = "agents" | "threats" | "pointsOfInterest";
type FolderId = "agents.shared" | `${BetaMissionId}.${Category}`;

export interface BetaFolderRoute {
  readonly type: OrganizerType;
  readonly id: FolderId;
  readonly legacy: "root" | BetaMissionId;
}

export function betaAgentFolder(shared: boolean, mission: BetaMissionId): BetaFolderRoute {
  return { type: "Actor", id: shared ? "agents.shared" : `${mission}.agents`, legacy: shared ? "root" : mission };
}

export function betaThreatFolder(mission: BetaMissionId): BetaFolderRoute {
  return { type: "Actor", id: `${mission}.threats`, legacy: mission };
}

export function betaPoiFolder(mission: BetaMissionId): BetaFolderRoute {
  return { type: "Item", id: `${mission}.pointsOfInterest`, legacy: mission };
}

const root = "Contos da Vigília";
const nodes: readonly AdventureFolderNode[] = [
  { documentType: "Actor", id: "root", name: root },
  { documentType: "Actor", id: "agents", parent: "root", name: "Agentes" },
  { documentType: "Actor", id: "agents.shared", parent: "agents", name: "Compartilhados" },
  { documentType: "Item", id: "root", name: root },
  ...BETA_MISSIONS.flatMap((mission, index): AdventureFolderNode[] => [
    { documentType: "Actor", id: mission, parent: "root", name: "Missão " + (index + 1) },
    { documentType: "Actor", id: `${mission}.agents`, parent: mission, name: "Agentes" },
    { documentType: "Actor", id: `${mission}.threats`, parent: mission, name: "Ameaças" },
    { documentType: "Item", id: mission, parent: "root", name: "Missão " + (index + 1) },
    { documentType: "Item", id: `${mission}.pointsOfInterest`, parent: mission, name: "Pontos de Interesse" },
  ]),
];

function legacyIdentity(snapshot: AdventureFolderSnapshot, adventureId: string): AdventureFolderFlag | null {
  const flag = snapshot.flag as Record<string, unknown> | null | undefined;
  if (flag?.adventureId !== adventureId || flag.importer !== "Folder") return null;
  const match = typeof flag.documentId === "string" && /^folder:(Actor|Item)(?::(mission1|mission2))?$/u.exec(flag.documentId);
  if (!match) return null;
  if (flag.version !== 1 || typeof flag.desired !== "string" || !Array.isArray(flag.fields) || flag.fields.length !== 0
    || (flag.baseline !== null && typeof flag.baseline !== "string")) {
    throw new Error("Proveniência de pasta Beta antiga incompatível: " + snapshot.id + ".");
  }
  return { importer: "folder", version: 1, adventureId, documentType: match[1] as OrganizerType, folderId: match[2] ?? "root" };
}

export function prepareBetaFolders(routes: readonly BetaFolderRoute[], folders: AdventureFolderPort) {
  const needed = new Set(routes.map(route => route.type + ":" + route.id));
  for (const node of [...nodes].reverse()) {
    if (node.parent && needed.has(node.documentType + ":" + node.id)) needed.add(node.documentType + ":" + node.parent);
  }
  return prepareAdventureFolderTree({ adventureId: BETA_ID, folders, legacyIdentity,
    nodes: nodes.filter(node => needed.has(node.documentType + ":" + node.id)) });
}

const placementScope = "ordemparanormal2";
const placementKey = "adventureImportFolder";

export function betaFolderPlacement(target: Pick<BetaTarget, "id">, route: BetaFolderRoute) {
  return { version: 1, adventureId: BETA_ID, documentType: route.type, documentId: target.id, folderId: route.id };
}

export function betaFolderSource(target: BetaTarget, route: BetaFolderRoute, folder: string) {
  const flags = target.source.flags as Record<string, Record<string, unknown>> | undefined;
  return { ...target.source, folder, flags: { ...flags,
    [placementScope]: { ...flags?.[placementScope], [placementKey]: betaFolderPlacement(target, route) } } };
}

function samePlacement(value: unknown, expected: ReturnType<typeof betaFolderPlacement>) {
  return !!value && typeof value === "object" && Object.entries(expected)
    .every(([key, field]) => (value as Record<string, unknown>)[key] === field);
}

export async function reconcileBetaFolderPlacement(document: BetaDocument, target: BetaTarget, route: BetaFolderRoute,
  ids: ReadonlyMap<string, string>, guard: () => void): Promise<string | undefined> {
  const folder = ids.get(route.type + ":" + route.id);
  const legacy = ids.get(route.type + ":" + route.legacy);
  if (!folder || !legacy) throw new Error("Pasta Beta não preparada: " + target.name + ".");
  const expected = betaFolderPlacement(target, route);
  const marker = document.getFlag(placementScope, placementKey);
  if (samePlacement(marker, expected)) return;
  const current = document.toObject().folder ?? null;
  if (marker !== undefined || current !== legacy && current !== folder)
    return document.name + " (" + document.uuid + ")";

  guard();
  await document.update({
    ...(current !== folder ? { folder } : {}),
    [ADVENTURE_FOLDER_PLACEMENT_FLAG_PATH]: expected,
  });
  if (!samePlacement(document.getFlag(placementScope, placementKey), expected) || document.toObject().folder !== folder)
    throw new Error("Organização Beta não confirmada: " + target.name + ".");
}
