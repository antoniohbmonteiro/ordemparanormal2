import { registerCheckRequestResultQuery } from "../adapters/foundry/chat/check-request-result-query";

export function registerCheckRequests(): void {
  registerCheckRequestResultQuery();
}
