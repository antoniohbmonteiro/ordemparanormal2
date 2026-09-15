import { describe, expect, it } from "vitest";

import { sha256Hex } from "./compute-sha256";

describe("sha256Hex", () => {
  it("matches the published SHA-256 test vector for an empty input", async () => {
    const digest = await sha256Hex(new Uint8Array(0));
    expect(digest).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  });

  it("matches the published SHA-256 test vector for the ASCII string \"abc\"", async () => {
    const digest = await sha256Hex(new TextEncoder().encode("abc"));
    expect(digest).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });

  it("returns a lowercase 64-character hex string", async () => {
    const digest = await sha256Hex(new TextEncoder().encode("ordem paranormal"));
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
  });
});
