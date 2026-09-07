import { describe, expect, it, vi } from "vitest";

// @ts-expect-error The release script is intentionally plain Node ESM.
import { buildDiscordAnnouncementPayload, main, parseReleaseAnnouncement, sendDiscordAnnouncement } from "../../scripts/release/discord-announcement.mjs";

const release = (image = "") => `# Ordem Paranormal 2 — v1.2.3

Introdução.

## Destaques

- **Primeiro** destaque.
- Segundo destaque.

## Detalhes

Este conteúdo não pertence ao anúncio.

${image}`;

describe("Discord release announcement", () => {
  it("extracts Destaques without including the following section", () => {
    const result = parseReleaseAnnouncement(release());
    expect(result.title).toBe("Ordem Paranormal 2 — v1.2.3");
    expect(result.highlights).toBe("- **Primeiro** destaque.\n- Segundo destaque.");
    expect(result.highlights).not.toContain("Detalhes");
    expect(result.highlights).not.toContain("não pertence");
  });

  it("extracts the first Markdown image when it has a public URL", () => {
    const result = parseReleaseAnnouncement(release([
      "![Principal](https://example.com/main.png)",
      "![Secundária](https://example.com/other.png)",
    ].join("\n")));
    expect(result.imageUrl).toBe("https://example.com/main.png");
  });

  it("builds an embed without an image when the release has none", () => {
    const payload = buildDiscordAnnouncementPayload(release(), {
      repository: "owner/repository",
      tag: "v1.2.3",
    });
    expect(payload.embeds[0]).not.toHaveProperty("image");
    expect(payload.embeds[0].url).toBe(
      "https://github.com/owner/repository/releases/tag/v1.2.3",
    );
  });

  it("ignores a local first image instead of sending it to Discord", () => {
    expect(parseReleaseAnnouncement(release("![Local](C:/Temp/image.png)")).imageUrl)
      .toBeNull();
  });

  it("warns and succeeds when the webhook secret is absent", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    await expect(main({})).resolves.toBeUndefined();
    expect(log).toHaveBeenCalledWith(expect.stringContaining("::warning"));
    log.mockRestore();
  });

  it("reports a non-success Discord response as an error", async () => {
    const request = vi.fn().mockResolvedValue({ ok: false, status: 400 });
    await expect(sendDiscordAnnouncement(
      "https://discord.com/api/webhooks/example",
      { embeds: [] },
      request,
    )).rejects.toThrow("Discord webhook returned HTTP 400.");
  });
});
