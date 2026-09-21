import type { AdventureAct } from "../../core/adventure-import/recognize-zip-source";

export const ADVENTURE_FOLDER_FLAG_PATH = "flags.ordemparanormal2.adventureImport";
export const ADVENTURE_FOLDER_PLACEMENT_FLAG_PATH = "flags.ordemparanormal2.adventureImportFolder";
export const ADVENTURE_ROOT_FOLDER_NAME = "A Maldição do Ídolo de Pedra";
export const ADVENTURE_ROOT_FOLDER_COLOR = "#7a2424";
export const ADVENTURE_ACT_FOLDER_COLOR = "#4f2525";

export type AdventureFolderDocumentType = "Actor" | "JournalEntry" | "Scene";
export type AdventureFolderId = "root" | AdventureAct;

export interface AdventureFolderFlag {
  readonly importer: "folder";
  readonly version: 1;
  readonly adventureId: string;
  readonly documentType: AdventureFolderDocumentType;
  readonly folderId: AdventureFolderId;
}

export interface AdventureFolderPlacementFlag {
  readonly version: 1;
  readonly adventureId: string;
  readonly documentType: AdventureFolderDocumentType;
  readonly documentId: string;
  readonly act: AdventureAct;
}

export interface AdventureFolderSnapshot {
  readonly id: string;
  readonly name: string;
  readonly color: string | null;
  readonly type: string;
  readonly parentId: string | null;
  readonly flag: unknown;
}

export interface AdventureFolderPort {
  isAuthorized(): boolean;
  listFolders(): readonly AdventureFolderSnapshot[];
  createFolder(data: {
    readonly name: string;
    readonly color: string;
    readonly documentType: AdventureFolderDocumentType;
    readonly parentId: string | null;
    readonly flag: AdventureFolderFlag;
  }): Promise<string>;
  updateFolder(id: string, data: {
    readonly name: string;
    readonly color: string;
    readonly flag: AdventureFolderFlag;
  }): Promise<void>;
}

export interface AdventureFolderRequirement {
  readonly documentType: AdventureFolderDocumentType;
  readonly acts: readonly AdventureAct[];
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function isAct(value: unknown): value is AdventureAct {
  return value === "actOne" || value === "actTwo";
}

function folderName(folderId: AdventureFolderId): string {
  if (folderId === "root") return ADVENTURE_ROOT_FOLDER_NAME;
  return folderId === "actOne" ? "Ato I" : "Ato II";
}

function folderColor(folderId: AdventureFolderId): string {
  return folderId === "root" ? ADVENTURE_ROOT_FOLDER_COLOR : ADVENTURE_ACT_FOLDER_COLOR;
}

function readIdentity(snapshot: AdventureFolderSnapshot, adventureId: string): AdventureFolderFlag | null {
  const flag = record(snapshot.flag);
  if (!flag) return null;
  if (flag.importer === "folder") {
    if (typeof flag.adventureId !== "string") throw new Error(`Provenance de Folder incompatível: ${snapshot.id}.`);
    if (flag.adventureId !== adventureId) return null;
    if (flag.version !== 1 || !["Actor", "JournalEntry", "Scene"].includes(String(flag.documentType))
      || (flag.folderId !== "root" && !isAct(flag.folderId))) {
      throw new Error(`Provenance de Folder incompatível: ${snapshot.id}.`);
    }
    return flag as unknown as AdventureFolderFlag;
  }
  const legacyType = flag.importer === "actorFolder" ? "Actor" : flag.importer === "handout" ? "JournalEntry" : null;
  if (!legacyType) return null;
  if (typeof flag.adventureId !== "string") throw new Error(`Provenance legada de Folder incompatível: ${snapshot.id}.`);
  if (flag.adventureId !== adventureId) return null;
  if (flag.version !== 1 || (flag.folderId !== "root" && !isAct(flag.folderId))) {
    throw new Error(`Provenance legada de Folder incompatível: ${snapshot.id}.`);
  }
  return { importer: "folder", version: 1, adventureId, documentType: legacyType, folderId: flag.folderId };
}

function identityKey(documentType: AdventureFolderDocumentType, folderId: AdventureFolderId): string {
  return `${documentType}:${folderId}`;
}

function requiredIdentities(requirements: readonly AdventureFolderRequirement[]): ReadonlySet<string> {
  const keys = new Set<string>();
  for (const requirement of requirements) {
    keys.add(identityKey(requirement.documentType, "root"));
    for (const act of requirement.acts) keys.add(identityKey(requirement.documentType, act));
  }
  return keys;
}

export function preflightAdventureFolders(input: {
  readonly adventureId: string;
  readonly requirements: readonly AdventureFolderRequirement[];
  readonly folders: AdventureFolderPort;
}): void {
  if (!input.folders.isAuthorized()) throw new Error("Somente o GM ativo pode organizar as pastas da aventura.");
  const required = requiredIdentities(input.requirements);
  const found = new Map<string, AdventureFolderSnapshot>();
  for (const snapshot of input.folders.listFolders()) {
    const identity = readIdentity(snapshot, input.adventureId);
    if (!identity) continue;
    const key = identityKey(identity.documentType, identity.folderId);
    if (!required.has(key)) continue;
    if (snapshot.type !== identity.documentType) throw new Error(`Tipo incompatível na Folder ${snapshot.id}: esperado ${identity.documentType}.`);
    const duplicate = found.get(key);
    if (duplicate) throw new Error(`Identidade duplicada de Folder ${key}: ${duplicate.id}, ${snapshot.id}.`);
    found.set(key, snapshot);
  }
  for (const requirement of input.requirements) {
    const root = found.get(identityKey(requirement.documentType, "root"));
    if (root?.parentId) throw new Error(`A Folder root de ${requirement.documentType} possui parent incompatível: ${root.id}.`);
    for (const act of requirement.acts) {
      const child = found.get(identityKey(requirement.documentType, act));
      if (child && (!root || child.parentId !== root.id)) {
        throw new Error(`Parent incompatível na Folder ${requirement.documentType}:${act}: ${child.id}.`);
      }
    }
  }
}

async function ensureOne(input: {
  readonly adventureId: string;
  readonly documentType: AdventureFolderDocumentType;
  readonly folderId: AdventureFolderId;
  readonly parentId: string | null;
  readonly folders: AdventureFolderPort;
}): Promise<string> {
  const expected: AdventureFolderFlag = { importer: "folder", version: 1, adventureId: input.adventureId,
    documentType: input.documentType, folderId: input.folderId };
  const matches = input.folders.listFolders().filter(snapshot => {
    const identity = readIdentity(snapshot, input.adventureId);
    return identity?.documentType === input.documentType && identity.folderId === input.folderId;
  });
  if (matches.length > 1) throw new Error(`Identidade duplicada de Folder ${input.documentType}:${input.folderId}.`);
  const existing = matches[0];
  if (!existing) {
    if (!input.folders.isAuthorized()) throw new Error("O GM ativo mudou. Execute a importação novamente.");
    const id = await input.folders.createFolder({ name: folderName(input.folderId), color: folderColor(input.folderId),
      documentType: input.documentType, parentId: input.parentId, flag: expected });
    const persisted = input.folders.listFolders().find(folder => folder.id === id);
    const identity = persisted ? readIdentity(persisted, input.adventureId) : null;
    if (!persisted || identity?.documentType !== input.documentType || identity.folderId !== input.folderId
      || persisted.type !== input.documentType || persisted.parentId !== input.parentId) {
      throw new Error(`Criação de Folder não confirmada: ${input.documentType}:${input.folderId}.`);
    }
    return id;
  }
  if (existing.type !== input.documentType || existing.parentId !== input.parentId) {
    throw new Error(`Estrutura incompatível na Folder ${existing.id}.`);
  }
  const current = record(existing.flag);
  const needsUpdate = existing.name !== folderName(input.folderId) || existing.color?.toLowerCase() !== folderColor(input.folderId)
    || current?.importer !== "folder" || current.version !== 1 || current.adventureId !== input.adventureId
    || current.documentType !== input.documentType || current.folderId !== input.folderId;
  if (needsUpdate) {
    if (!input.folders.isAuthorized()) throw new Error("O GM ativo mudou. Execute a importação novamente.");
    await input.folders.updateFolder(existing.id, { name: folderName(input.folderId), color: folderColor(input.folderId), flag: expected });
    const persisted = input.folders.listFolders().find(folder => folder.id === existing.id);
    const identity = persisted ? readIdentity(persisted, input.adventureId) : null;
    if (!persisted || persisted.name !== folderName(input.folderId) || persisted.color?.toLowerCase() !== folderColor(input.folderId)
      || identity?.documentType !== input.documentType || identity.folderId !== input.folderId) {
      throw new Error(`Atualização de Folder não confirmada: ${existing.id}.`);
    }
  }
  return existing.id;
}

export async function ensureAdventureFolder(input: {
  readonly adventureId: string;
  readonly documentType: AdventureFolderDocumentType;
  readonly act: AdventureAct;
  readonly folders: AdventureFolderPort;
}): Promise<string> {
  preflightAdventureFolders({ adventureId: input.adventureId,
    requirements: [{ documentType: input.documentType, acts: [input.act] }], folders: input.folders });
  const rootId = await ensureOne({ ...input, folderId: "root", parentId: null });
  return ensureOne({ ...input, folderId: input.act, parentId: rootId });
}

export function adventureFolderPlacementFlag(input: {
  readonly adventureId: string;
  readonly documentType: AdventureFolderDocumentType;
  readonly documentId: string;
  readonly act: AdventureAct;
}): AdventureFolderPlacementFlag {
  return { version: 1, ...input };
}

export function hasAdventureFolderPlacement(value: unknown, expected: AdventureFolderPlacementFlag): boolean {
  const flag = record(value);
  if (!flag) return false;
  if (flag.version !== 1 || flag.adventureId !== expected.adventureId || flag.documentType !== expected.documentType
    || flag.documentId !== expected.documentId || flag.act !== expected.act) {
    throw new Error(`Marcação de organização incompatível: ${expected.documentType}:${expected.documentId}.`);
  }
  return true;
}
