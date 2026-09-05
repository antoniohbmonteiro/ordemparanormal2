import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  isSafeTextMessage,
  isSupportedCheckSnapshot,
  readCardPresentationFlag,
  readCheckPresentationAccentColor,
  resolveChatMessageShellEligibility,
  resolveTextTierSubtitleKey,
} from "./resolve-chat-message-presentation";

const CHAT_MESSAGE_STYLES = { OTHER: 0, OOC: 1, IC: 2, EMOTE: 3 } as const;

beforeEach(() => {
  vi.stubGlobal("CONST", {
    CHAT_MESSAGE_STYLES,
    BASE_DOCUMENT_TYPE: "base",
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function createV3Snapshot(): Record<string, unknown> {
  return {
    schemaVersion: 3,
    check: { kind: "skill", key: "athletics", name: "Atletismo" },
    components: [
      { kind: "attribute", key: "mind", label: "Mente", die: 10, result: 8 },
    ],
    extraDice: [],
    total: 8,
  };
}

interface FakeMessageOptions {
  readonly flags?: Record<string, unknown>;
  readonly isRoll?: boolean;
  readonly type?: string;
  readonly style?: number;
  readonly whisper?: readonly string[];
  readonly blind?: boolean;
  readonly flavor?: string;
  readonly title?: string;
  readonly author?: { readonly isGM: boolean } | null;
}

function createFakeMessage(options: FakeMessageOptions = {}): ChatMessage {
  return {
    isRoll: options.isRoll ?? false,
    type: options.type ?? "base",
    style: options.style ?? CHAT_MESSAGE_STYLES.IC,
    whisper: options.whisper ?? [],
    blind: options.blind ?? false,
    flavor: options.flavor ?? "",
    title: options.title ?? "",
    author: options.author === undefined ? null : options.author,
    getFlag(scope: string, key: string): unknown {
      if (scope !== "ordemparanormal2") return undefined;
      return options.flags?.[key];
    },
  } as unknown as ChatMessage;
}

describe("isSupportedCheckSnapshot", () => {
  it.each([1, 2, 3] as const)(
    "recognizes a structurally valid V%s Check snapshot",
    (schemaVersion) => {
      const snapshot = createV3Snapshot();
      snapshot.schemaVersion = schemaVersion;

      if (schemaVersion !== 3) delete snapshot.extraDice;
      if (schemaVersion === 2) {
        snapshot.difficulty = 8;
        snapshot.outcome = "success";
      }

      expect(isSupportedCheckSnapshot(snapshot)).toBe(true);
    },
  );

  it("rejects a malformed snapshot", () => {
    expect(isSupportedCheckSnapshot({ schemaVersion: 3 })).toBe(false);
  });

  it("rejects an unsupported schema version", () => {
    expect(isSupportedCheckSnapshot({ ...createV3Snapshot(), schemaVersion: 4 })).toBe(
      false,
    );
  });
});

describe("readCheckPresentationAccentColor", () => {
  it("normalizes a valid accent color", () => {
    expect(readCheckPresentationAccentColor({ accentColor: "#4176ba" })).toBe(
      "#4176BA",
    );
  });

  it.each([undefined, {}, { accentColor: "red" }, { accentColor: "#1234" }])(
    "returns null for %j",
    (value) => {
      expect(readCheckPresentationAccentColor(value)).toBeNull();
    },
  );
});

describe("readCardPresentationFlag", () => {
  it("accepts a valid ability card marker with an accent color", () => {
    expect(
      readCardPresentationFlag({ card: "ability", accentColor: "#4176ba" }),
    ).toEqual({ card: "ability", accentColor: "#4176BA" });
  });

  it("accepts a valid ability card marker without an accent color", () => {
    expect(readCardPresentationFlag({ card: "ability" })).toEqual({
      card: "ability",
    });
  });

  it("accepts a valid equipment card marker with an accent color", () => {
    expect(
      readCardPresentationFlag({ card: "equipment", accentColor: "#4176ba" }),
    ).toEqual({ card: "equipment", accentColor: "#4176BA" });
  });

  it("accepts a valid equipment card marker without an accent color", () => {
    expect(readCardPresentationFlag({ card: "equipment" })).toEqual({
      card: "equipment",
    });
  });

  it.each([
    ["an unrecognized card kind", { card: "item" }],
    ["a non-record value", undefined],
    ["a missing card field", {}],
  ])("rejects %s", (_, value) => {
    expect(readCardPresentationFlag(value)).toBeNull();
  });
});

describe("isSafeTextMessage", () => {
  it.each([
    ["IC", CHAT_MESSAGE_STYLES.IC],
    ["OOC", CHAT_MESSAGE_STYLES.OOC],
    ["EMOTE", CHAT_MESSAGE_STYLES.EMOTE],
  ])("accepts a %s-style message with no risk signals", (_, style) => {
    expect(isSafeTextMessage(createFakeMessage({ style }))).toBe(true);
  });

  it("rejects OTHER style", () => {
    expect(
      isSafeTextMessage(createFakeMessage({ style: CHAT_MESSAGE_STYLES.OTHER })),
    ).toBe(false);
  });

  it.each([
    ["a message with attached rolls", { isRoll: true }],
    ["a non-base message type", { type: "custom" }],
    ["a whispered message", { whisper: ["user1"] }],
    ["a blind message", { blind: true }],
    ["a message with flavor text", { flavor: "Some flavor" }],
    ["a message with a title", { title: "Some title" }],
  ])("rejects %s", (_, overrides) => {
    expect(isSafeTextMessage(createFakeMessage(overrides))).toBe(false);
  });
});

describe("resolveChatMessageShellEligibility", () => {
  it("recognizes a legacy Check snapshot regardless of style", () => {
    const message = createFakeMessage({
      style: CHAT_MESSAGE_STYLES.OTHER,
      flags: {
        check: createV3Snapshot(),
        checkPresentation: { accentColor: "#4176ba" },
      },
    });

    expect(resolveChatMessageShellEligibility(message)).toEqual({
      kind: "card",
      accentColor: "#4176BA",
    });
  });

  it("recognizes the generic Ability card flag regardless of style", () => {
    const message = createFakeMessage({
      style: CHAT_MESSAGE_STYLES.OTHER,
      flags: { cardPresentation: { card: "ability", accentColor: "#4176ba" } },
    });

    expect(resolveChatMessageShellEligibility(message)).toEqual({
      kind: "card",
      accentColor: "#4176BA",
    });
  });

  it("recognizes the generic Equipment card flag regardless of style", () => {
    const message = createFakeMessage({
      style: CHAT_MESSAGE_STYLES.OTHER,
      flags: { cardPresentation: { card: "equipment", accentColor: "#4176ba" } },
    });

    expect(resolveChatMessageShellEligibility(message)).toEqual({
      kind: "card",
      accentColor: "#4176BA",
    });
  });

  it("prefers the legacy Check flag over the generic flag when both are present", () => {
    const message = createFakeMessage({
      flags: {
        check: createV3Snapshot(),
        cardPresentation: { card: "ability", accentColor: "#123456" },
      },
    });

    expect(resolveChatMessageShellEligibility(message)).toEqual({
      kind: "card",
      accentColor: null,
    });
  });

  it("falls back to TEXT for a safe IC/OOC/EMOTE message with no flags", () => {
    const message = createFakeMessage({ style: CHAT_MESSAGE_STYLES.OOC });

    expect(resolveChatMessageShellEligibility(message)).toEqual({ kind: "text" });
  });

  it("falls back to NATIVE (null) for an OTHER-style message with no flag", () => {
    const message = createFakeMessage({ style: CHAT_MESSAGE_STYLES.OTHER });

    expect(resolveChatMessageShellEligibility(message)).toBeNull();
  });

  it.each([
    ["isRoll", { isRoll: true }],
    ["a non-base type", { type: "custom" }],
    ["a whisper", { whisper: ["u1"] }],
    ["blind", { blind: true }],
    ["flavor", { flavor: "x" }],
    ["a title", { title: "x" }],
  ])("falls back to NATIVE (null) for %s", (_, overrides) => {
    const message = createFakeMessage(overrides);

    expect(resolveChatMessageShellEligibility(message)).toBeNull();
  });
});

describe("resolveTextTierSubtitleKey", () => {
  it("labels an IC message as Conversa", () => {
    const message = createFakeMessage({ style: CHAT_MESSAGE_STYLES.IC });

    expect(resolveTextTierSubtitleKey(message)).toBe(
      "ORDEMPARANORMAL2.ChatMessage.RoleConversation",
    );
  });

  it("labels an EMOTE message as Narrador", () => {
    const message = createFakeMessage({ style: CHAT_MESSAGE_STYLES.EMOTE });

    expect(resolveTextTierSubtitleKey(message)).toBe(
      "ORDEMPARANORMAL2.ChatMessage.RoleNarrator",
    );
  });

  it("labels an OOC message from a GM as Gamemaster", () => {
    const message = createFakeMessage({
      style: CHAT_MESSAGE_STYLES.OOC,
      author: { isGM: true },
    });

    expect(resolveTextTierSubtitleKey(message)).toBe(
      "ORDEMPARANORMAL2.ChatMessage.RoleGamemaster",
    );
  });

  it.each([
    ["a non-GM author", { isGM: false }],
    ["no author", null],
  ])("labels an OOC message from %s as Jogador", (_, author) => {
    const message = createFakeMessage({ style: CHAT_MESSAGE_STYLES.OOC, author });

    expect(resolveTextTierSubtitleKey(message)).toBe(
      "ORDEMPARANORMAL2.ChatMessage.RolePlayer",
    );
  });
});
