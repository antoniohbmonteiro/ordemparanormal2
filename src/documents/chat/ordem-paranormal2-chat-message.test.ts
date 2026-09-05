import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { readAgentAccentColorMock } = vi.hoisted(() => ({
  readAgentAccentColorMock: vi.fn(),
}));

vi.mock("../../adapters/foundry/actors/read-agent-accent-color", () => ({
  readAgentAccentColor: readAgentAccentColorMock,
}));

const CHAT_MESSAGE_STYLES = { OTHER: 0, OOC: 1, IC: 2, EMOTE: 3 } as const;

interface HarnessOptions {
  readonly flag?: unknown;
  readonly presentationFlag?: unknown;
  readonly cardPresentationFlag?: unknown;
  readonly isContentVisible?: boolean;
  readonly speakerActor?: { readonly img?: string; readonly name?: string } | null;
  readonly alias?: string;
  readonly canUserModify?: boolean;
  readonly user?: { readonly isGM: boolean } | null;
  readonly author?: { readonly isGM: boolean } | null;
  readonly timestamp?: number;
  readonly isRoll?: boolean;
  readonly type?: string;
  readonly style?: number;
  readonly whisper?: readonly string[];
  readonly blind?: boolean;
  readonly flavor?: string;
  readonly title?: string;
}

function createV3Snapshot(): Record<string, unknown> {
  return {
    schemaVersion: 3,
    check: { kind: "skill", key: "athletics", name: "Atletismo" },
    components: [
      {
        kind: "attribute",
        key: "mind",
        label: "Mente",
        die: 10,
        result: 8,
      },
    ],
    extraDice: [],
    total: 8,
  };
}

async function createHarness(options: HarnessOptions = {}) {
  const root = {
    classList: { add: vi.fn() },
    replaceChildren: vi.fn(),
  };
  const deleteButton = { addEventListener: vi.fn() };
  const shell = {
    querySelector: vi.fn(() => deleteButton),
    style: { setProperty: vi.fn() },
  };
  const templateElement = {
    innerHTML: "",
    content: { firstElementChild: shell },
  };
  const superRender = vi.fn().mockResolvedValue(root);
  const canUserModify = vi.fn(
    (_user: unknown, _action: string) => options.canUserModify ?? true,
  );
  const deleteMessage = vi.fn().mockResolvedValue(undefined);
  const renderTemplate = vi.fn().mockResolvedValue("<div>shell</div>");
  const localize = vi.fn((key: string) => key);

  class NativeChatMessage {
    content = "<article>Check</article>";
    alias = options.alias ?? "Agente sem Actor";
    speakerActor = options.speakerActor ?? null;
    isContentVisible = options.isContentVisible ?? true;
    timestamp = options.timestamp;
    isRoll = options.isRoll ?? false;
    type = options.type ?? "base";
    style = options.style ?? CHAT_MESSAGE_STYLES.OTHER;
    whisper = options.whisper ?? [];
    blind = options.blind ?? false;
    flavor = options.flavor ?? "";
    title = options.title ?? "";
    author = options.author === undefined ? null : options.author;

    renderHTML(renderOptions?: unknown): Promise<unknown> {
      return superRender(renderOptions);
    }

    getFlag(scope: string, key: string): unknown {
      if (scope !== "ordemparanormal2") return undefined;
      if (key === "check") return options.flag;
      if (key === "checkPresentation") return options.presentationFlag;
      if (key === "cardPresentation") return options.cardPresentationFlag;
      return undefined;
    }

    canUserModify(user: unknown, action: string): boolean {
      return canUserModify(user, action);
    }

    delete(): Promise<undefined> {
      return deleteMessage();
    }
  }

  vi.stubGlobal("ChatMessage", NativeChatMessage);
  vi.stubGlobal("CONST", {
    CHAT_MESSAGE_STYLES,
    BASE_DOCUMENT_TYPE: "base",
  });
  vi.stubGlobal("game", {
    user: options.user === undefined ? { isGM: true } : options.user,
    i18n: { localize },
  });
  vi.stubGlobal("ui", { notifications: { error: vi.fn() } });
  vi.stubGlobal("foundry", {
    applications: { handlebars: { renderTemplate } },
  });
  vi.stubGlobal("document", {
    createElement: vi.fn(() => templateElement),
  });
  vi.resetModules();

  const module = await import("./ordem-paranormal2-chat-message");
  const message = new module.OrdemParanormal2ChatMessage({} as never);

  return {
    ...module,
    message,
    root,
    shell,
    deleteButton,
    superRender,
    canUserModify,
    deleteMessage,
    renderTemplate,
    localize,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  readAgentAccentColorMock.mockReturnValue("#7F252B");
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("OrdemParanormal2ChatMessage", () => {
  it.each([
    ["a normal message", undefined, true, undefined],
    ["a malformed Check flag", { schemaVersion: 3 }, true, undefined],
    ["an unsupported snapshot", { schemaVersion: 4 }, true, undefined],
    ["hidden content", createV3Snapshot(), false, undefined],
    ["a closable notification", createV3Snapshot(), true, { canClose: true }],
  ])("delegates %s completely to Foundry", async (_, flag, visible, renderOptions) => {
    const harness = await createHarness({ flag, isContentVisible: visible });

    const rendered = await harness.message.renderHTML(renderOptions);

    expect(rendered).toBe(harness.root);
    expect(harness.superRender).toHaveBeenCalledOnce();
    expect(harness.superRender).toHaveBeenCalledWith(renderOptions);
    expect(harness.renderTemplate).not.toHaveBeenCalled();
    expect(harness.root.replaceChildren).not.toHaveBeenCalled();
  });

  it("adds only the native baseline class for hidden content and closable notifications", async () => {
    const hidden = await createHarness({
      flag: createV3Snapshot(),
      isContentVisible: false,
    });
    await hidden.message.renderHTML();
    expect(hidden.root.classList.add).not.toHaveBeenCalled();

    const closable = await createHarness({ flag: createV3Snapshot() });
    await closable.message.renderHTML({ canClose: true });
    expect(closable.root.classList.add).not.toHaveBeenCalled();
  });

  it("keeps the Foundry root and replaces only its children for a visible Check", async () => {
    const harness = await createHarness({
      flag: createV3Snapshot(),
      speakerActor: { img: " actors/agent.webp ", name: " Agente " },
    });

    const rendered = await harness.message.renderHTML();

    expect(rendered).toBe(harness.root);
    expect(harness.root.classList.add).toHaveBeenCalledWith(
      "op2-chat-message",
      "op2-chat-message--card",
    );
    expect(harness.root.replaceChildren).toHaveBeenCalledWith(harness.shell);
    expect(harness.renderTemplate).toHaveBeenCalledWith(
      "systems/ordemparanormal2/templates/chat/chat-message-shell.hbs",
      {
        content: "<article>Check</article>",
        speakerName: "Agente",
        portrait: { name: "Agente", img: "actors/agent.webp" },
        canDelete: true,
      },
    );
    expect(harness.shell.style.setProperty).not.toHaveBeenCalled();
  });

  it("applies only a valid snapshotted presentation accent to the shell", async () => {
    const harness = await createHarness({
      flag: createV3Snapshot(),
      presentationFlag: { accentColor: "#4176ba" },
      speakerActor: { name: "Agente", img: "actor.webp" },
    });

    await harness.message.renderHTML();

    expect(harness.shell.style.setProperty).toHaveBeenCalledWith(
      "--op2-check-accent",
      "#4176BA",
    );
  });

  it.each([
    undefined,
    {},
    { accentColor: "red" },
    { accentColor: "#1234" },
  ])("keeps the historical CSS fallback for presentation %j", async (presentationFlag) => {
    const harness = await createHarness({
      flag: createV3Snapshot(),
      presentationFlag,
    });

    await harness.message.renderHTML();

    expect(harness.shell.style.setProperty).not.toHaveBeenCalled();
  });

  it("formats the public message timestamp as fixed local-time metadata", async () => {
    const timestamp = new Date(2026, 8, 1, 13, 58).getTime();
    const harness = await createHarness({
      flag: createV3Snapshot(),
      timestamp,
    });

    await harness.message.renderHTML();

    expect(harness.formatChatMessageTime(timestamp)).toBe("13:58");
    expect(harness.renderTemplate).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ metadata: "13:58" }),
    );
  });

  it.each([undefined, null, Number.NaN, Number.POSITIVE_INFINITY, 0])(
    "omits unusable timestamp %s",
    async (timestamp) => {
      const harness = await createHarness({
        flag: createV3Snapshot(),
        ...(typeof timestamp === "number" ? { timestamp } : {}),
      });

      expect(harness.formatChatMessageTime(timestamp)).toBeUndefined();
    },
  );

  it.each([
    ["explicit false", false, true, true, false],
    ["explicit true with permission", true, false, true, true],
    ["explicit true without permission", true, true, false, false],
    ["native GM default", undefined, true, true, true],
    ["native non-GM default", undefined, false, true, false],
  ])(
    "resolves canDelete for %s",
    async (_, requested, isGM, mayDelete, expected) => {
      const harness = await createHarness({
        flag: createV3Snapshot(),
        user: { isGM },
        canUserModify: mayDelete,
      });

      await harness.message.renderHTML(
        requested === undefined ? undefined : { canDelete: requested },
      );

      expect(harness.renderTemplate).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ canDelete: expected }),
      );
      const shouldCheckPermission = requested ?? isGM;

      expect(harness.canUserModify).toHaveBeenCalledTimes(
        shouldCheckPermission ? 1 : 0,
      );
      if (shouldCheckPermission) {
        expect(harness.canUserModify).toHaveBeenCalledWith(
          expect.anything(),
          "delete",
        );
      }
    },
  );

  it("never offers delete when the current user is unavailable", async () => {
    const harness = await createHarness({
      flag: createV3Snapshot(),
      user: null,
    });

    await harness.message.renderHTML({ canDelete: true });

    expect(harness.renderTemplate).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ canDelete: false }),
    );
    expect(harness.canUserModify).not.toHaveBeenCalled();
  });

  it("uses the public delete API from the shell action", async () => {
    const harness = await createHarness({ flag: createV3Snapshot() });
    await harness.message.renderHTML();
    const listener = harness.deleteButton.addEventListener.mock.calls[0]?.[1] as
      | ((event: { preventDefault(): void }) => void)
      | undefined;
    const preventDefault = vi.fn();

    listener?.({ preventDefault });

    await vi.waitFor(() => expect(harness.deleteMessage).toHaveBeenCalledOnce());
    expect(preventDefault).toHaveBeenCalledOnce();
  });

  it("reports delete failures with localized UI feedback using the shared chat-message key", async () => {
    const harness = await createHarness({ flag: createV3Snapshot() });
    harness.deleteMessage.mockRejectedValueOnce(new Error("failure"));
    await harness.message.renderHTML();
    const listener = harness.deleteButton.addEventListener.mock.calls[0]?.[1] as
      | ((event: { preventDefault(): void }) => void)
      | undefined;

    listener?.({ preventDefault: vi.fn() });

    await vi.waitFor(() =>
      expect(ui.notifications.error).toHaveBeenCalledWith(
        "ORDEMPARANORMAL2.ChatMessage.DeleteFailed",
      ),
    );
    expect(harness.localize).toHaveBeenCalledWith(
      "ORDEMPARANORMAL2.ChatMessage.DeleteFailed",
    );
  });
});

describe("portrait presence rule", () => {
  it("shows the portrait with the Actor's image and name tooltip when the Actor has an image", async () => {
    const harness = await createHarness({
      flag: createV3Snapshot(),
      speakerActor: { img: " actors/agent.webp ", name: " Agente " },
    });

    await harness.message.renderHTML();

    const context = harness.renderTemplate.mock.calls[0]?.[1] as Record<
      string,
      unknown
    >;
    expect(context.speakerName).toBe("Agente");
    expect(context.portrait).toEqual({ name: "Agente", img: "actors/agent.webp" });
  });

  it("shows the portrait with a fallback icon and name tooltip when the Actor has no image", async () => {
    const harness = await createHarness({
      flag: createV3Snapshot(),
      speakerActor: { name: "Agente sem retrato" },
    });

    await harness.message.renderHTML();

    const context = harness.renderTemplate.mock.calls[0]?.[1] as Record<
      string,
      unknown
    >;
    expect(context.portrait).toEqual({ name: "Agente sem retrato" });
  });

  it("renders no portrait and reserves no space when there is no Actor", async () => {
    const harness = await createHarness({
      flag: createV3Snapshot(),
      alias: "Alias histórico",
      speakerActor: null,
    });

    await harness.message.renderHTML();

    const context = harness.renderTemplate.mock.calls[0]?.[1] as Record<
      string,
      unknown
    >;
    expect(context).not.toHaveProperty("portrait");
    expect(context.speakerName).toBe("Alias histórico");
  });
});

describe("TEXT tier — safe plain messages", () => {
  it("wraps an IC-style message in a real header (author name as title, 'Conversa' as subtitle)", async () => {
    const harness = await createHarness({
      style: CHAT_MESSAGE_STYLES.IC,
      speakerActor: { name: "Agente", img: "actors/agent.webp" },
    });

    const rendered = await harness.message.renderHTML();

    expect(rendered).toBe(harness.root);
    expect(harness.root.classList.add).toHaveBeenCalledWith(
      "op2-chat-message",
      "op2-chat-message--text",
    );
    expect(harness.root.replaceChildren).toHaveBeenCalledWith(harness.shell);
    expect(harness.renderTemplate.mock.calls[0]?.[1]).toMatchObject({
      header: {
        title: "Agente",
        subtitle: "ORDEMPARANORMAL2.ChatMessage.RoleConversation",
      },
      portrait: { name: "Agente", img: "actors/agent.webp" },
    });
  });

  it("labels an EMOTE-style message as 'Narrador'", async () => {
    const harness = await createHarness({ style: CHAT_MESSAGE_STYLES.EMOTE });

    await harness.message.renderHTML();

    expect(harness.renderTemplate.mock.calls[0]?.[1]).toMatchObject({
      header: { subtitle: "ORDEMPARANORMAL2.ChatMessage.RoleNarrator" },
    });
  });

  it.each([
    ["a GM author", { isGM: true }, "ORDEMPARANORMAL2.ChatMessage.RoleGamemaster"],
    ["a non-GM author", { isGM: false }, "ORDEMPARANORMAL2.ChatMessage.RolePlayer"],
  ])("labels an OOC-style message from %s accordingly", async (_, author, subtitleKey) => {
    const harness = await createHarness({
      style: CHAT_MESSAGE_STYLES.OOC,
      author,
    });

    await harness.message.renderHTML();

    expect(harness.renderTemplate.mock.calls[0]?.[1]).toMatchObject({
      header: { subtitle: subtitleKey },
    });
  });

  it("uses the alias as the header title when there is no Actor", async () => {
    const harness = await createHarness({
      style: CHAT_MESSAGE_STYLES.OOC,
      alias: "Convidado",
      speakerActor: null,
    });

    await harness.message.renderHTML();

    const context = harness.renderTemplate.mock.calls[0]?.[1] as Record<
      string,
      unknown
    >;
    expect(context.header).toMatchObject({ title: "Convidado" });
    expect(context).not.toHaveProperty("portrait");
  });

  it("resolves the shell accent from the speaker Actor's own accent color", async () => {
    readAgentAccentColorMock.mockReturnValue("#4176BA");
    const harness = await createHarness({
      style: CHAT_MESSAGE_STYLES.IC,
      speakerActor: { name: "Agente", img: "actors/agent.webp" },
    });

    await harness.message.renderHTML();

    expect(readAgentAccentColorMock).toHaveBeenCalledWith(
      harness.message.speakerActor,
    );
    expect(harness.shell.style.setProperty).toHaveBeenCalledWith(
      "--op2-check-accent",
      "#4176BA",
    );
  });

  it("falls back to the system default accent when there is no Actor", async () => {
    const harness = await createHarness({
      style: CHAT_MESSAGE_STYLES.OOC,
      speakerActor: null,
    });

    await harness.message.renderHTML();

    expect(readAgentAccentColorMock).not.toHaveBeenCalled();
    expect(harness.shell.style.setProperty).toHaveBeenCalledWith(
      "--op2-check-accent",
      "#7F252B",
    );
  });

  it("recognizes the generic Ability card flag and applies the CARD shell with its accent color", async () => {
    const harness = await createHarness({
      style: CHAT_MESSAGE_STYLES.OTHER,
      cardPresentationFlag: { card: "ability", accentColor: "#4176ba" },
      speakerActor: { name: "Agente", img: "actors/agent.webp" },
    });

    await harness.message.renderHTML();

    expect(harness.root.classList.add).toHaveBeenCalledWith(
      "op2-chat-message",
      "op2-chat-message--card",
    );
    expect(harness.shell.style.setProperty).toHaveBeenCalledWith(
      "--op2-check-accent",
      "#4176BA",
    );
    expect(harness.renderTemplate.mock.calls[0]?.[1]).not.toHaveProperty(
      "header",
    );
    expect(readAgentAccentColorMock).not.toHaveBeenCalled();
  });
});

describe("NATIVE tier — untouched native rendering", () => {
  it.each([
    ["a message with attached rolls", { isRoll: true }],
    ["a non-base message type", { type: "custom" }],
    ["an OTHER-style message with no OP2 flag", {}],
    ["a whispered message", { style: CHAT_MESSAGE_STYLES.IC, whisper: ["userId"] }],
    ["a blind message", { style: CHAT_MESSAGE_STYLES.IC, blind: true }],
    ["a message with flavor text", { style: CHAT_MESSAGE_STYLES.IC, flavor: "flavor" }],
    ["a message with a title", { style: CHAT_MESSAGE_STYLES.IC, title: "title" }],
  ])("leaves the native root untouched for %s", async (_, overrides) => {
    const harness = await createHarness(overrides);

    const rendered = await harness.message.renderHTML();

    expect(rendered).toBe(harness.root);
    expect(harness.renderTemplate).not.toHaveBeenCalled();
    expect(harness.root.replaceChildren).not.toHaveBeenCalled();
    expect(harness.root.classList.add).toHaveBeenCalledWith(
      "op2-chat-message--native",
    );
  });
});

describe("ChatMessage document registration", () => {
  it("registers the OP2 class in CONFIG.ChatMessage.documentClass", async () => {
    const harness = await createHarness();
    const ChatMessageConfig = { documentClass: ChatMessage };
    vi.stubGlobal("CONFIG", { ChatMessage: ChatMessageConfig });
    const { registerChatMessageDocument } = await import(
      "../../bootstrap/register-chat-message-document"
    );

    registerChatMessageDocument();

    expect(ChatMessageConfig.documentClass).toBe(
      harness.OrdemParanormal2ChatMessage,
    );
  });
});
