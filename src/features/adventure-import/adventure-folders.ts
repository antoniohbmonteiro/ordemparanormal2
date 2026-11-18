import type { AdventureAct } from "../../core/adventure-import/recognize-zip-source";

export const ADVENTURE_FOLDER_FLAG_PATH = "flags.ordemparanormal2.adventureImport";
export const ADVENTURE_FOLDER_PLACEMENT_FLAG_PATH = "flags.ordemparanormal2.adventureImportFolder";
export const ADVENTURE_ROOT_FOLDER_NAME = "A Maldição do Ídolo de Pedra";
export const ADVENTURE_ROOT_FOLDER_COLOR = "#7a2424";
export const ADVENTURE_ACT_FOLDER_COLOR = "#4f2525";

export type AdventureFolderDocumentType = "Actor" | "JournalEntry" | "Scene" | "Item";
export type AdventureFolderId = "root" | AdventureAct | `${AdventureAct}.pointsOfInterest` | "actTwo.tools";

export interface AdventureFolderFlag {
  readonly importer: "folder";
  readonly version: 1;
  readonly adventureId: string;
  readonly documentType: AdventureFolderDocumentType;
  readonly folderId: string;
}

export interface AdventureFolderPlacementFlag {
  readonly version: 1;
  readonly adventureId: string;
  readonly documentType: AdventureFolderDocumentType;
  readonly documentId: string;
  readonly act: AdventureAct;
  readonly folderId?: "pointsOfInterest" | "tools";
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
    readonly name?: string;
    readonly color?: string;
    readonly flag: AdventureFolderFlag;
  }): Promise<void>;
}

export interface AdventureFolderRequirement {
  readonly documentType: AdventureFolderDocumentType;
  readonly acts: readonly AdventureAct[];
  readonly tools?: boolean;
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function isAct(value: unknown): value is AdventureAct {
  return value === "actOne" || value === "actTwo";
}

function isPoiFolder(value: unknown): value is `${AdventureAct}.pointsOfInterest` {
  return value === "actOne.pointsOfInterest" || value === "actTwo.pointsOfInterest";
}

function folderName(folderId: AdventureFolderId): string {
  if (folderId === "root") return ADVENTURE_ROOT_FOLDER_NAME;
  if (isPoiFolder(folderId)) return "Pontos de Interesse";
  if (folderId === "actTwo.tools") return "Ferramentas";
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
    if (flag.version !== 1 || !["Actor", "JournalEntry", "Scene", "Item"].includes(String(flag.documentType))
      || (flag.folderId !== "root" && !isAct(flag.folderId)
        && !(flag.documentType === "Item" && (isPoiFolder(flag.folderId) || flag.folderId === "actTwo.tools")))) {
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

function identityKey(documentType: AdventureFolderDocumentType, folderId: string): string {
  return `${documentType}:${folderId}`;
}

function requiredIdentities(requirements: readonly AdventureFolderRequirement[]): ReadonlySet<string> {
  const keys = new Set<string>();
  for (const requirement of requirements) {
    if (requirement.tools && (requirement.documentType !== "Item" || !requirement.acts.includes("actTwo"))) throw new Error("Escopo de Folder de ferramentas inválido.");
    if (requirement.tools) keys.add(identityKey("Item", "actTwo.tools"));
    keys.add(identityKey(requirement.documentType, "root"));
    for (const act of requirement.acts) {
      keys.add(identityKey(requirement.documentType, act));
      if (requirement.documentType === "Item") keys.add(identityKey("Item", `${act}.pointsOfInterest`));
    }
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
      if (requirement.documentType === "Item") {
        const tools = requirement.tools && act === "actTwo" ? found.get(identityKey("Item", "actTwo.tools")) : null;
        if (tools && (!child || tools.parentId !== child.id)) throw new Error(`Parent incompatível na Folder Item:actTwo.tools: ${tools.id}.`);
        const poi = found.get(identityKey("Item", `${act}.pointsOfInterest`));
        if (poi && (!child || poi.parentId !== child.id)) {
          throw new Error(`Parent incompatível na Folder Item:${act}.pointsOfInterest: ${poi.id}.`);
        }
      }
    }
  }
}

type ReadFolderIdentity = (snapshot: AdventureFolderSnapshot, adventureId: string) => AdventureFolderFlag | null;

async function ensureOne(input: {
  readonly adventureId: string;
  readonly documentType: AdventureFolderDocumentType;
  readonly folderId: string;
  readonly parentId: string | null;
  readonly folders: AdventureFolderPort;
  readonly name: string;
  readonly color: string;
  readonly read?: ReadFolderIdentity;
  readonly preserveAppearance?: boolean;
}): Promise<string> {
  const read = input.read ?? readIdentity;
  const expected: AdventureFolderFlag = { importer: "folder", version: 1, adventureId: input.adventureId,
    documentType: input.documentType, folderId: input.folderId };
  const matches = input.folders.listFolders().filter(snapshot => {
    const identity = read(snapshot, input.adventureId);
    return identity?.documentType === input.documentType && identity.folderId === input.folderId;
  });
  if (matches.length > 1) throw new Error(`Identidade duplicada de Folder ${input.documentType}:${input.folderId}.`);
  const existing = matches[0];
  if (!existing) {
    if (!input.folders.isAuthorized()) throw new Error("O GM ativo mudou. Execute a importação novamente.");
    const id = await input.folders.createFolder({ name: input.name, color: input.color,
      documentType: input.documentType, parentId: input.parentId, flag: expected });
    const persisted = input.folders.listFolders().find(folder => folder.id === id);
    const identity = persisted ? read(persisted, input.adventureId) : null;
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
  const appearance = input.preserveAppearance ? {} : { name: input.name, color: input.color };
  const appearanceChanged = !input.preserveAppearance
    && (existing.name !== input.name || existing.color?.toLowerCase() !== input.color);
  const needsUpdate = appearanceChanged || current?.importer !== "folder" || current.version !== 1 || current.adventureId !== input.adventureId
    || current.documentType !== input.documentType || current.folderId !== input.folderId;
  if (needsUpdate) {
    if (!input.folders.isAuthorized()) throw new Error("O GM ativo mudou. Execute a importação novamente.");
    await input.folders.updateFolder(existing.id, { ...appearance, flag: expected });
    const persisted = input.folders.listFolders().find(folder => folder.id === existing.id);
    const identity = persisted ? read(persisted, input.adventureId) : null;
    if (!persisted || (!input.preserveAppearance && (persisted.name !== input.name || persisted.color?.toLowerCase() !== input.color))
      || identity?.documentType !== input.documentType || identity.folderId !== input.folderId) {
      throw new Error(`Atualização de Folder não confirmada: ${existing.id}.`);
    }
  }
  return existing.id;
}

function ensureAlphaFolder(input: Omit<Parameters<typeof ensureOne>[0], "name" | "color" | "folderId"> & { folderId: AdventureFolderId }) {
  return ensureOne({ ...input, name: folderName(input.folderId), color: folderColor(input.folderId) });
}

export interface AdventureFolderNode {
  readonly documentType: AdventureFolderDocumentType;
  readonly id: string;
  readonly parent?: string;
  readonly name: string;
}

export function prepareAdventureFolderTree(input: {
  readonly adventureId: string;
  readonly folders: AdventureFolderPort;
  readonly nodes: readonly AdventureFolderNode[];
  readonly legacyIdentity: ReadFolderIdentity;
}) {
  const { adventureId, folders, nodes, legacyIdentity } = input;
  const requested = new Map(nodes.map(node => [identityKey(node.documentType, node.id), node]));
  if (requested.size !== nodes.length) throw new Error("O plano contém pastas duplicadas.");
  function read(snapshot: AdventureFolderSnapshot, id: string): AdventureFolderFlag | null {
    const flag = record(snapshot.flag);
    if (flag?.adventureId !== id || flag.importer !== "folder") return legacyIdentity(snapshot, id);
    const key = identityKey(flag.documentType as AdventureFolderDocumentType, String(flag.folderId));
    const node = requested.get(key);
    if (!node) return null;
    if (flag.version !== 1 || flag.documentType !== node.documentType || flag.folderId !== node.id)
      throw new Error("Proveniência de pasta incompatível: " + snapshot.id + ".");
    return { importer: "folder", version: 1, adventureId: id, documentType: node.documentType, folderId: node.id };
  }

  function inspect() {
    if (!folders.isAuthorized()) throw new Error("Somente o GM ativo pode organizar as pastas da aventura.");
    const found = new Map<string, AdventureFolderSnapshot>();
    for (const snapshot of folders.listFolders()) {
      const identity = read(snapshot, adventureId);
      if (!identity) continue;
      const key = identityKey(identity.documentType, identity.folderId);
      if (!requested.has(key)) continue;
      if (snapshot.type !== identity.documentType || found.has(key))
        throw new Error("Identidade de pasta incompatível ou duplicada: " + key + ".");
      found.set(key, snapshot);
    }

    const earlier = new Set<string>();
    for (const [key, node] of requested) {
      const parentKey = node.parent && identityKey(node.documentType, node.parent);
      if (parentKey && !earlier.has(parentKey)) throw new Error("Pasta pai ausente no plano: " + key + ".");
      earlier.add(key);
      const current = found.get(key);
      const expected = parentKey ? found.get(parentKey)?.id : null;
      if (current && current.parentId !== expected) throw new Error("Pasta gerenciada em nível incompatível: " + node.name + ".");
    }
    return found;
  }

  inspect();
  return async () => {
    inspect();
    const ids = new Map<string, string>();
    for (const [key, node] of requested) {
      const parentId = node.parent ? ids.get(identityKey(node.documentType, node.parent))! : null;
      ids.set(key, await ensureOne({ adventureId, folders, documentType: node.documentType, folderId: node.id,
        name: node.name, color: node.parent ? ADVENTURE_ACT_FOLDER_COLOR : ADVENTURE_ROOT_FOLDER_COLOR,
        parentId, read, preserveAppearance: true }));
    }
    return ids;
  };
}

export async function ensureAdventureFolder(input: {
  readonly adventureId: string;
  readonly documentType: AdventureFolderDocumentType;
  readonly act: AdventureAct;
  readonly folders: AdventureFolderPort;
}): Promise<string> {
  preflightAdventureFolders({ adventureId: input.adventureId,
    requirements: [{ documentType: input.documentType, acts: [input.act] }], folders: input.folders });
  const rootId = await ensureAlphaFolder({ ...input, folderId: "root", parentId: null });
  return ensureAlphaFolder({ ...input, folderId: input.act, parentId: rootId });
}

export async function ensureAdventurePoiFolder(input: {
  readonly adventureId: string;
  readonly act: AdventureAct;
  readonly folders: AdventureFolderPort;
}): Promise<{ readonly actId: string; readonly poiId: string }> {
  const actId = await ensureAdventureFolder({ ...input, documentType: "Item" });
  const poiId = await ensureAlphaFolder({ ...input, documentType: "Item",
    folderId: `${input.act}.pointsOfInterest`, parentId: actId });
  return { actId, poiId };
}

export async function ensureAdventureToolsFolder(input: {
  readonly adventureId: string;
  readonly folders: AdventureFolderPort;
}): Promise<string> {
  preflightAdventureFolders({ ...input, requirements: [{ documentType: "Item", acts: ["actTwo"], tools: true }] });
  const actId = await ensureAdventureFolder({ ...input, documentType: "Item", act: "actTwo" });
  return ensureAlphaFolder({ ...input, documentType: "Item", folderId: "actTwo.tools", parentId: actId });
}

export function adventureFolderPlacementFlag(input: {
  readonly adventureId: string;
  readonly documentType: AdventureFolderDocumentType;
  readonly documentId: string;
  readonly act: AdventureAct;
  readonly folderId?: "pointsOfInterest" | "tools";
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
  if (expected.folderId && "folderId" in flag && flag.folderId !== expected.folderId) {
    throw new Error(`Marcação de organização incompatível: ${expected.documentType}:${expected.documentId}.`);
  }
  if (expected.folderId && !("folderId" in flag)) return false;
  return true;
}
