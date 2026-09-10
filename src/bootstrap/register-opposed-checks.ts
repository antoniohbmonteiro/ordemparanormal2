import { registerOpposedCheckResultQuery } from "../adapters/foundry/chat/opposed-check-result-query";

export function registerOpposedChecks(): void {
  registerOpposedCheckResultQuery();
}
