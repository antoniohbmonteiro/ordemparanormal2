import { describe, expect, it } from "vitest";

import { canCreateUniqueAgentItem } from "./register-unique-agent-item-hooks";

describe("unique Agent Item guard", () => {
  it("blocks a second Profile or Occupation only on an Agent", () => {
    expect(canCreateUniqueAgentItem("profile", "agent", 1)).toBe(false);
    expect(canCreateUniqueAgentItem("occupation", "agent", 1)).toBe(false);
    expect(canCreateUniqueAgentItem("profile", "agent", 0)).toBe(true);
    expect(canCreateUniqueAgentItem("occupation", "agent", 0)).toBe(true);
    expect(canCreateUniqueAgentItem("ability", "agent", 1)).toBe(true);
    expect(canCreateUniqueAgentItem("occupation", "threat", 1)).toBe(true);
  });
});
