
import { managedDigest, stableSerialize } from "../../core/adventure-import/adventure-agent-reconciliation";
import { BETA_ID } from "../../config/adventure-definitions/playtest-beta";

const FLAG = "adventureImport";
const SCOPE = "ordemparanormal2";
const PATH = "flags." + SCOPE + "." + FLAG;
export type BetaDocumentType = "Actor" | "Item" | "JournalEntry" | "Scene" | "Playlist" | "Folder" | "Level" | "JournalEntryPage" | "PlaylistSound";
export type BetaConflictDecision = "preserve" | "restore" | "cancel";
type Data = Record<string, unknown>;

export interface BetaDocument {
  id: string;
  uuid: string;
  name: string;
  type?: string;
  getFlag(scope: string, key: string): unknown;
  toObject(): Data;
  update(data: Data): Promise<unknown>;
}

type DocumentClass = {
  new (data: Data, context?: { strict?: boolean; parent?: BetaDocument }): { validate(options: { strict: true }): boolean };
  create(data: Data, options?: Data): Promise<BetaDocument | undefined>;
};

interface BetaFlag {
  adventureId: typeof BETA_ID;
  importer: BetaDocumentType;
  documentId: string;
  version: 1;
  desired: string;
  baseline: string | null;
  fields: readonly string[];
}

export interface BetaTarget {
  type: BetaDocumentType;
  id: string;
  name: string;
  source: Data;
  managed: Data;
}

export interface BetaDocumentPort {
  list(): readonly BetaDocument[];
  create(data: Data): Promise<BetaDocument | undefined>;
  validate(source: Data): void;
}

function documentFlag(document: BetaDocument): Partial<BetaFlag> | undefined {
  const flag = document.getFlag(SCOPE, FLAG);
  return flag !== null && typeof flag === "object" ? flag as Partial<BetaFlag> : undefined;
}

export function betaDocumentPort(type: BetaDocumentType, parent?: BetaDocument): BetaDocumentPort {
  if (parent) {
    const host = parent as BetaDocument & {
      getEmbeddedCollection(name: BetaDocumentType): { contents: readonly BetaDocument[] };
      createEmbeddedDocuments(name: BetaDocumentType, data: Data[], options: Data): Promise<BetaDocument[]>;
    };
    const constructor = foundry.utils.getDocumentClass(type) as unknown as DocumentClass;
    return {
      list: () => host.getEmbeddedCollection(type).contents,
      async create(data) { return (await host.createEmbeddedDocuments(type, [data], { renderSheet: false, keepId: true }))[0]; },
      validate(source) {
        const draft = new constructor(source, { strict: true, parent });
        if (!draft.validate({ strict: true })) throw new Error("Documento Beta inválido: " + source.name);
      },
    };
  }
  const collections = (game as typeof game & { collections: Map<string, { contents: unknown[] }> }).collections;
  const collection = collections.get(type);
  if (!collection) throw new Error("Coleção Beta indisponível: " + type);
  const constructor = foundry.utils.getDocumentClass(type) as unknown as DocumentClass;
  return {
    list: () => collection.contents as unknown as readonly BetaDocument[],
    create: data => constructor.create(data, { renderSheet: false, keepId: true, keepEmbeddedIds: true }),
    validate(source) {
      const draft = new constructor(source, { strict: true });
      if (!draft.validate({ strict: true })) throw new Error("Documento Beta inválido: " + source.name);
    },
  };
}

export function findBetaDocument(port: BetaDocumentPort, target: Pick<BetaTarget, "type" | "id" | "name">): BetaDocument | undefined {
  const matches = port.list().filter(document => {
    const flag = documentFlag(document);
    return flag?.adventureId === BETA_ID && flag.documentId === target.id;
  });
  if (matches.length > 1) throw new Error("Documentos Beta duplicados: " + target.name + ".");
  const document = matches[0];
  if (!document) return undefined;
  const flag = documentFlag(document)!;
  if (flag.version !== 1 || flag.importer !== target.type || typeof flag.desired !== "string"
    || !Array.isArray(flag.fields) || flag.fields.some(field => typeof field !== "string")
    || flag.baseline !== null && typeof flag.baseline !== "string")
    throw new Error("Proveniência Beta inválida: " + target.name + ".");
  return document;
}

function projection(document: BetaDocument, fields: readonly string[]): Data {
  const source = document.toObject();
  return Object.fromEntries(fields.map(path => [path, foundry.utils.getProperty(source, path) ?? null]));
}

export async function betaDocumentHasChanges(port: BetaDocumentPort, target: BetaTarget): Promise<boolean> {
  const document = findBetaDocument(port, target);
  if (!document) return false;
  const flag = documentFlag(document)!;
  return !!flag.baseline && flag.baseline !== await managedDigest(projection(document, flag.fields!));
}

export async function betaSeedFlag(target: BetaTarget): Promise<BetaFlag> {
  return { adventureId: BETA_ID, importer: target.type, documentId: target.id, version: 1,
    desired: await managedDigest(target.managed), baseline: null, fields: Object.keys(target.managed) };
}

export async function reconcileBetaDocument(port: BetaDocumentPort, target: BetaTarget,
  guard: () => void, conflict: (name: string) => Promise<BetaConflictDecision>): Promise<BetaDocument> {
  guard();
  const flag = await betaSeedFlag(target);
  const { desired } = flag;
  let previous = findBetaDocument(port, target);
  if (previous && previous.type !== undefined && target.source.type !== undefined && previous.type !== target.source.type)
    throw new Error("Tipo incompatível para " + target.name + ".");
  if (!previous) {
    const flags = target.source.flags as Record<string, Data> | undefined;
    const id = target.source._id ?? (await managedDigest({ beta: BETA_ID, type: target.type, documentId: target.id })).slice(0, 16);
    if (port.list().some(document => document.id === id)) throw new Error("ID de documento Beta ocupado: " + target.name + ".");
    const payload = { ...target.source, _id: id, name: target.name, flags: { ...flags, [SCOPE]: { ...flags?.[SCOPE], [FLAG]: flag } } };
    port.validate(payload);
    guard();
    previous = await port.create(payload);
    if (!previous || previous.id !== id || findBetaDocument(port, target)?.id !== previous.id)
      throw new Error("Criação Beta não confirmada: " + target.name + ".");
  } else {
    const old = documentFlag(previous)!;
    const current = await managedDigest(projection(previous, old.fields!));
    const added = flag.fields.filter(field => !old.fields!.includes(field));
    const addedProjection = projection(previous, added);
    const replacingManual = added.some(field => addedProjection[field] !== null);
    if (old.baseline === current && old.desired === desired) return previous;
    if (replacingManual || old.baseline !== current && (old.baseline !== null || old.desired !== desired)) {
      const choice = await conflict(target.name);
      guard();
      if (choice === "cancel") throw new Error("Importação cancelada pelo mestre.");
      if (choice === "preserve") return previous;
      if (await managedDigest(projection(previous, old.fields!)) !== current
        || stableSerialize(projection(previous, added)) !== stableSerialize(addedProjection))
        throw new Error("Documento alterado durante a revisão: " + target.name + ".");
    }
    if (old.desired !== desired || old.baseline !== null && old.baseline !== current) {
      guard();
      const managed = Object.fromEntries(Object.entries(target.managed).map(([path, value]) =>
        [path, value !== null && typeof value === "object" ? foundry.data.operators.ForcedReplacement.create(value) : value]));
      await previous.update({ ...managed, [PATH]: foundry.data.operators.ForcedReplacement.create(flag) });
      if (documentFlag(previous)?.desired !== desired) throw new Error("Atualização Beta não confirmada: " + target.name + ".");
    }
  }
  guard();
  flag.baseline = await managedDigest(projection(previous, flag.fields));
  guard();
  await previous.update({ [PATH]: foundry.data.operators.ForcedReplacement.create(flag) });
  const confirmed = documentFlag(previous);
  if (confirmed?.baseline !== flag.baseline || confirmed.desired !== desired || confirmed.documentId !== target.id)
    throw new Error("Gravação Beta não confirmada: " + target.name + ".");
  return previous;
}
