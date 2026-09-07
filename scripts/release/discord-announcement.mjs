import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const DISCORD_FIELD_LIMIT = 1_024;
const DISCORD_TITLE_LIMIT = 256;
const TRUNCATION_NOTICE = "\n\n… Consulte a release completa no GitHub.";

function truncateUnicode(value, limit, suffix = "…") {
  const characters = [...value];
  if (characters.length <= limit) return value;
  return characters.slice(0, Math.max(0, limit - [...suffix].length)).join("").trimEnd() + suffix;
}

export function truncateDiscordHighlights(value, limit = DISCORD_FIELD_LIMIT) {
  if ([...value].length <= limit) return value;

  const available = limit - [...TRUNCATION_NOTICE].length;
  let prefix = [...value].slice(0, available).join("");
  const lastLineBreak = prefix.lastIndexOf("\n");
  if (lastLineBreak >= Math.floor(available * 0.6)) {
    prefix = prefix.slice(0, lastLineBreak);
  }
  return `${prefix.trimEnd()}${TRUNCATION_NOTICE}`;
}

function publicImageUrl(markdown) {
  const match = markdown.match(/!\[[^\]]*\]\(\s*(?:<([^>]+)>|([^\s)]+))(?:\s+["'][^)]*["'])?\s*\)/);
  const candidate = match?.[1] ?? match?.[2];
  if (!candidate) return null;

  try {
    const url = new URL(candidate);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

export function parseReleaseAnnouncement(markdown) {
  const lines = markdown.split(/\r?\n/);
  const titleLine = lines.find((line) => /^#\s+\S/.test(line));
  if (!titleLine) throw new Error("RELEASE_NOTES.md is missing its H1 title.");

  const highlightsStart = lines.findIndex((line) => /^##\s+Destaques\s*$/.test(line));
  if (highlightsStart < 0) {
    throw new Error('RELEASE_NOTES.md is missing the "## Destaques" section.');
  }
  const nextSectionOffset = lines
    .slice(highlightsStart + 1)
    .findIndex((line) => /^##\s+\S/.test(line));
  const highlightsEnd = nextSectionOffset < 0
    ? lines.length
    : highlightsStart + 1 + nextSectionOffset;
  const highlights = lines.slice(highlightsStart + 1, highlightsEnd).join("\n").trim();
  if (!highlights) throw new Error('The "## Destaques" section is empty.');

  return {
    title: titleLine.replace(/^#\s+/, "").trim(),
    highlights,
    imageUrl: publicImageUrl(markdown),
  };
}

export function buildDiscordAnnouncementPayload(markdown, { repository, tag }) {
  if (!repository || !tag) {
    throw new Error("GitHub repository and tag are required for the Discord announcement.");
  }
  const announcement = parseReleaseAnnouncement(markdown);
  const releaseUrl = `https://github.com/${repository}/releases/tag/${encodeURIComponent(tag)}`;
  const embed = {
    title: truncateUnicode(announcement.title, DISCORD_TITLE_LIMIT),
    url: releaseUrl,
    description: `[Ver release completa no GitHub](${releaseUrl})`,
    fields: [{
      name: "Destaques",
      value: truncateDiscordHighlights(announcement.highlights),
    }],
    ...(announcement.imageUrl ? { image: { url: announcement.imageUrl } } : {}),
  };

  return {
    allowed_mentions: { parse: [] },
    embeds: [embed],
  };
}

export async function sendDiscordAnnouncement(webhookUrl, payload, fetchImplementation = fetch) {
  let url;
  try {
    url = new URL(webhookUrl);
  } catch {
    throw new Error("DISCORD_RELEASE_WEBHOOK_URL is not a valid URL.");
  }
  if (url.protocol !== "https:") {
    throw new Error("DISCORD_RELEASE_WEBHOOK_URL must use HTTPS.");
  }

  const response = await fetchImplementation(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error(`Discord webhook returned HTTP ${response.status}.`);
  }
}

export async function main(environment = process.env) {
  const webhookUrl = environment.DISCORD_RELEASE_WEBHOOK_URL;
  if (!webhookUrl) {
    console.log("::warning title=Discord announcement skipped::DISCORD_RELEASE_WEBHOOK_URL is not configured.");
    return;
  }

  const markdown = await readFile("RELEASE_NOTES.md", "utf8");
  const payload = buildDiscordAnnouncementPayload(markdown, {
    repository: environment.GITHUB_REPOSITORY,
    tag: environment.GITHUB_REF_NAME,
  });
  await sendDiscordAnnouncement(webhookUrl, payload);
  console.log("Discord release announcement sent successfully.");
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (invokedPath === import.meta.url) {
  main().catch((error) => {
    console.error(`Discord release announcement failed: ${error instanceof Error ? error.message : "Unknown error"}`);
    process.exitCode = 1;
  });
}
