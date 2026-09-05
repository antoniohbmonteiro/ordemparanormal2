/// <reference types="@dfreds/foundry-types" />

// Foundry v14 exposes this runtime class, but @dfreds/foundry-types 14.366.1 omits it.
declare abstract class FoundryActorSheetV2Base extends foundry.applications.api.DocumentSheetV2 {
  protected _onDropItem(
    event: DragEvent,
    item: foundry.documents.Item,
  ): Promise<foundry.documents.Item | null | undefined>;
  protected _onDropFolder(
    event: DragEvent,
    folder: foundry.documents.Folder,
  ): Promise<foundry.documents.Item[] | null | undefined>;
}

interface FoundryApplicationSheetsWithActorSheetV2 {
  readonly ActorSheetV2: typeof FoundryActorSheetV2Base;
}

declare abstract class FoundryItemSheetV2Base extends foundry.applications.api.DocumentSheetV2 {
  protected _onDropDocument<
    TDocument extends foundry.abstract.Document,
  >(
    event: DragEvent,
    document: TDocument,
  ): Promise<TDocument | null>;
}

interface FoundryApplicationSheetsWithItemSheetV2 {
  readonly ItemSheetV2: typeof FoundryItemSheetV2Base;
}

declare const CONFIG: {
  readonly ui: Record<string, unknown>;
  readonly Actor: {
    readonly dataModels: Record<
      string,
      ConstructorOf<
        foundry.abstract.TypeDataModel<
          foundry.documents.Actor,
          foundry.abstract.DataSchema
        >
      >
    >;
  };
  readonly ChatMessage: {
    documentClass: ConstructorOf<ChatMessage>;
    readonly modes: Record<
      string,
      {
        readonly handler: (data: object) => void;
        readonly icon: string;
        readonly label: string;
      }
    >;
  };
  readonly Item: {
    readonly dataModels: Record<
      string,
      ConstructorOf<
        foundry.abstract.TypeDataModel<
          foundry.documents.Item,
          foundry.abstract.DataSchema
        >
      >
    >;
  };
};

declare const game: {
  readonly i18n: {
    format(key: string, data?: Record<string, unknown>): string;
    localize(key: string): string;
  };
  readonly settings: {
    get(namespace: "core", key: "messageMode"): unknown;
    get(namespace: string, key: string): unknown;
    register(
      namespace: string,
      key: string,
      data: {
        readonly name: string;
        readonly hint?: string;
        readonly scope: "client" | "world";
        readonly config: boolean;
        readonly type: StringConstructor | BooleanConstructor | NumberConstructor;
        readonly default: string | boolean | number;
        readonly onChange?: (value: unknown) => void | Promise<void>;
      },
    ): void;
    set(namespace: string, key: string, value: unknown): Promise<unknown>;
  };
  readonly system: {
    readonly version: string;
  };
  readonly user: foundry.documents.User;
};

declare const ui: {
  readonly notifications: {
    error(message: string): void;
    info(message: string): void;
    warn(message: string): void;
  };
};

interface FoundryRegistryAwareRoll {
  toMessage(
    messageData?: object,
    options?: { readonly create?: true; readonly messageMode?: string },
  ): Promise<unknown>;
}
