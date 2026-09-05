import { OrdemParanormal2ChatMessage } from "../documents/chat/ordem-paranormal2-chat-message";

export function registerChatMessageDocument(): void {
  CONFIG.ChatMessage.documentClass = OrdemParanormal2ChatMessage;
}
