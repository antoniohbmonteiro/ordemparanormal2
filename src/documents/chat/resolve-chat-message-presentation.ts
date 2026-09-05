import type { CheckSnapshot } from "../../application/checks/check-snapshot";
import {
  ABILITY_CARD_KIND,
  CARD_PRESENTATION_FLAG,
  CHECK_PRESENTATION_FLAG,
  EQUIPMENT_CARD_KIND,
  SYSTEM_ID,
} from "../../config/system-config";
import {
  normalizeAccentColor,
  type AccentColor,
} from "../../core/actors/agent-accent-color";

const KNOWN_CARD_KINDS = [ABILITY_CARD_KIND, EQUIPMENT_CARD_KIND] as const;

export interface ChatCardPresentationFlag {
  readonly card: (typeof KNOWN_CARD_KINDS)[number];
  readonly accentColor?: AccentColor;
}

export type ChatMessageShellEligibility =
  | { readonly kind: "card"; readonly accentColor: AccentColor | null }
  | { readonly kind: "text" };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function readCheckPresentationAccentColor(
  value: unknown,
): AccentColor | null {
  if (!isRecord(value)) return null;
  return normalizeAccentColor(value.accentColor);
}

function isSnapshotComponent(value: unknown): boolean {
  if (!isRecord(value)) return false;

  return (
    typeof value.kind === "string" &&
    typeof value.key === "string" &&
    typeof value.label === "string" &&
    typeof value.die === "number" &&
    typeof value.result === "number"
  );
}

function isSnapshotExtraDie(value: unknown): boolean {
  if (!isRecord(value)) return false;

  return (
    typeof value.id === "string" &&
    typeof value.die === "number" &&
    value.source === "situational" &&
    typeof value.label === "string" &&
    typeof value.result === "number"
  );
}

export function isSupportedCheckSnapshot(
  value: unknown,
): value is CheckSnapshot {
  if (!isRecord(value)) return false;
  if (
    value.schemaVersion !== 1 &&
    value.schemaVersion !== 2 &&
    value.schemaVersion !== 3
  ) {
    return false;
  }
  if (!isRecord(value.check)) return false;
  if (
    typeof value.check.kind !== "string" ||
    typeof value.check.key !== "string" ||
    typeof value.check.name !== "string"
  ) {
    return false;
  }
  if (
    !Array.isArray(value.components) ||
    value.components.length === 0 ||
    !value.components.every(isSnapshotComponent)
  ) {
    return false;
  }
  if (typeof value.total !== "number") return false;

  if (
    value.schemaVersion === 3 &&
    (!Array.isArray(value.extraDice) || !value.extraDice.every(isSnapshotExtraDie))
  ) {
    return false;
  }

  const hasDifficulty = typeof value.difficulty === "number";
  const hasOutcome = value.outcome === "success" || value.outcome === "failure";
  return value.schemaVersion === 1
    ? !hasDifficulty && !hasOutcome
    : hasDifficulty === hasOutcome;
}

export function readCardPresentationFlag(
  value: unknown,
): ChatCardPresentationFlag | null {
  if (!isRecord(value)) return null;
  if (!KNOWN_CARD_KINDS.includes(value.card as (typeof KNOWN_CARD_KINDS)[number])) {
    return null;
  }

  const accentColor = normalizeAccentColor(value.accentColor);
  return {
    card: value.card as (typeof KNOWN_CARD_KINDS)[number],
    ...(accentColor ? { accentColor } : {}),
  };
}

function isTextTierStyle(style: number | null): boolean {
  return (
    style === CONST.CHAT_MESSAGE_STYLES.IC ||
    style === CONST.CHAT_MESSAGE_STYLES.OOC ||
    style === CONST.CHAT_MESSAGE_STYLES.EMOTE
  );
}

// ChatMessage#title is a real Foundry v14 field not yet covered by the installed
// @dfreds/foundry-types (14.366.1) type declarations; read defensively.
function readMessageTitle(message: ChatMessage): string {
  const value = (message as unknown as { readonly title?: unknown }).title;
  return typeof value === "string" ? value : "";
}

export function isSafeTextMessage(message: ChatMessage): boolean {
  return (
    !message.isRoll &&
    message.type === CONST.BASE_DOCUMENT_TYPE &&
    isTextTierStyle(message.style) &&
    message.whisper.length === 0 &&
    !message.blind &&
    !(message.flavor ?? "").length &&
    !readMessageTitle(message).length
  );
}

/**
 * Localization key for the TEXT tier's header subtitle (role/type label).
 * Only meaningful for a message that already satisfies {@link isSafeTextMessage}.
 */
export function resolveTextTierSubtitleKey(message: ChatMessage): string {
  if (message.style === CONST.CHAT_MESSAGE_STYLES.EMOTE) {
    return "ORDEMPARANORMAL2.ChatMessage.RoleNarrator";
  }
  if (message.style === CONST.CHAT_MESSAGE_STYLES.OOC) {
    return message.author?.isGM
      ? "ORDEMPARANORMAL2.ChatMessage.RoleGamemaster"
      : "ORDEMPARANORMAL2.ChatMessage.RolePlayer";
  }
  return "ORDEMPARANORMAL2.ChatMessage.RoleConversation";
}

export function resolveChatMessageShellEligibility(
  message: ChatMessage,
): ChatMessageShellEligibility | null {
  const checkSnapshot = message.getFlag(SYSTEM_ID, "check");
  if (isSupportedCheckSnapshot(checkSnapshot)) {
    return {
      kind: "card",
      accentColor: readCheckPresentationAccentColor(
        message.getFlag(SYSTEM_ID, CHECK_PRESENTATION_FLAG),
      ),
    };
  }

  const cardPresentation = readCardPresentationFlag(
    message.getFlag(SYSTEM_ID, CARD_PRESENTATION_FLAG),
  );
  if (cardPresentation) {
    return {
      kind: "card",
      accentColor: cardPresentation.accentColor ?? null,
    };
  }

  if (isSafeTextMessage(message)) {
    return { kind: "text" };
  }

  return null;
}
