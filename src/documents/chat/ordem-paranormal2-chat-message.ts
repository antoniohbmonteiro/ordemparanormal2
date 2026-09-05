import { readAgentAccentColor } from "../../adapters/foundry/actors/read-agent-accent-color";
import { SYSTEM_DEFAULT_ACCENT_COLOR } from "../../core/actors/agent-accent-color";
import { SYSTEM_ID } from "../../config/system-config";
import {
  resolveChatMessageShellEligibility,
  resolveTextTierSubtitleKey,
} from "./resolve-chat-message-presentation";

const CHAT_MESSAGE_SHELL_TEMPLATE =
  `systems/${SYSTEM_ID}/templates/chat/chat-message-shell.hbs`;

type ChatMessageRenderOptions = Parameters<ChatMessage["renderHTML"]>[0];

interface ChatMessagePortraitViewModel {
  readonly img?: string;
  readonly name: string;
}

interface ChatMessageHeaderViewModel {
  readonly title: string;
  readonly subtitle?: string;
}

interface ChatMessageShellViewModel {
  readonly content: string;
  readonly speakerName: string;
  readonly portrait?: ChatMessagePortraitViewModel;
  readonly header?: ChatMessageHeaderViewModel;
  readonly metadata?: string;
  readonly canDelete: boolean;
}

export function formatChatMessageTime(timestamp: unknown): string | undefined {
  if (typeof timestamp !== "number" || !Number.isFinite(timestamp) || timestamp <= 0) {
    return undefined;
  }

  const creationDate = new Date(timestamp);
  if (!Number.isFinite(creationDate.getTime())) return undefined;

  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    hourCycle: "h23",
  }).format(creationDate);
}

function createShellElement(html: string): HTMLElement | null {
  const template = document.createElement("template");
  template.innerHTML = html.trim();
  return template.content.firstElementChild as HTMLElement | null;
}

export class OrdemParanormal2ChatMessage extends ChatMessage {
  override async renderHTML(
    options?: ChatMessageRenderOptions,
  ): Promise<HTMLElement> {
    const root = await super.renderHTML(options);

    if (options?.canClose === true || !this.isContentVisible) return root;

    const eligibility = resolveChatMessageShellEligibility(this);
    if (!eligibility) {
      root.classList.add("op2-chat-message--native");
      return root;
    }

    const user = game.user;
    const canDelete =
      (options?.canDelete ?? user?.isGM === true) &&
      user != null &&
      this.canUserModify(user, "delete");
    const actor = this.speakerActor;
    const speakerName = actor?.name?.trim() || this.alias;
    const portraitImg = actor?.img?.trim();
    const portrait: ChatMessagePortraitViewModel | undefined = actor
      ? {
          name: actor.name?.trim() || speakerName,
          ...(portraitImg ? { img: portraitImg } : {}),
        }
      : undefined;
    const metadata = formatChatMessageTime(this.timestamp);
    const header: ChatMessageHeaderViewModel | undefined =
      eligibility.kind === "text"
        ? {
            title: speakerName,
            subtitle: game.i18n.localize(resolveTextTierSubtitleKey(this)),
          }
        : undefined;
    const context: ChatMessageShellViewModel = {
      content: this.content,
      speakerName,
      ...(portrait ? { portrait } : {}),
      ...(header ? { header } : {}),
      ...(metadata ? { metadata } : {}),
      canDelete,
    };
    const html = await foundry.applications.handlebars.renderTemplate(
      CHAT_MESSAGE_SHELL_TEMPLATE,
      context,
    );
    const shell = createShellElement(html);

    if (!shell) return root;

    if (eligibility.kind === "card") {
      if (eligibility.accentColor) {
        shell.style.setProperty("--op2-check-accent", eligibility.accentColor);
      }
    } else {
      const textAccent = actor
        ? readAgentAccentColor(actor)
        : SYSTEM_DEFAULT_ACCENT_COLOR;
      shell.style.setProperty("--op2-check-accent", textAccent);
    }

    shell
      .querySelector<HTMLButtonElement>("[data-action='delete-message']")
      ?.addEventListener("click", (event) => {
        event.preventDefault();
        void this.#deleteFromShell();
      });

    root.classList.add(
      "op2-chat-message",
      eligibility.kind === "text" ? "op2-chat-message--text" : "op2-chat-message--card",
    );
    root.replaceChildren(shell);
    return root;
  }

  async #deleteFromShell(): Promise<void> {
    try {
      await this.delete();
    } catch (error) {
      console.error(`${SYSTEM_ID} | Failed to delete chat message.`, error);
      ui.notifications.error(
        game.i18n.localize("ORDEMPARANORMAL2.ChatMessage.DeleteFailed"),
      );
    }
  }
}
