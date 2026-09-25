// Semantic structure recovered from the PDF layout, rendered as plain rich-text HTML for `gmContext`.
export interface GmContextEntry {
  readonly label?: string;
  readonly text: string;
}
export type GmContextContent =
  | { readonly type: "paragraph"; readonly text: string }
  | { readonly type: "entries"; readonly entries: readonly GmContextEntry[] };
export type GmContextBlock =
  | GmContextContent
  | { readonly type: "section"; readonly title: string; readonly content: readonly GmContextContent[] };

// Quotes are safe in HTML text. Foundry's HTML sanitizer decodes quote entities in text nodes.
export const escapeHtmlText = (value: string): string => value.replace(/&/g, "&amp;").replace(/</g, "&lt;")
  .replace(/>/g, "&gt;");

function renderContent(content: GmContextContent): string {
  if (content.type === "paragraph") return content.text.trim() ? `<p>${escapeHtmlText(content.text.trim())}</p>` : "";
  const items = content.entries.filter(entry => entry.text.trim() || entry.label?.trim()).map(entry => {
    const label = entry.label?.trim();
    const text = escapeHtmlText(entry.text.trim());
    if (!label) return `<li><p>${text}</p></li>`;
    const strong = `<strong>${escapeHtmlText(label.endsWith(":") ? label : `${label}:`)}</strong>`;
    return `<li><p>${text ? `${strong} ${text}` : strong}</p></li>`;
  });
  return items.length ? `<ul>${items.join("")}</ul>` : "";
}

// Emits only tags Foundry's sanitizer keeps verbatim (no attributes, no whitespace between elements), in
// the shape Foundry's ProseMirror schema serializes (list items hold a paragraph). Saving the editor
// unchanged therefore keeps the value, and reimport digests stay stable.
export function renderGmContextHtml(blocks: readonly GmContextBlock[]): string {
  return blocks.map(block => {
    if (block.type !== "section") return renderContent(block);
    const body = block.content.map(renderContent).join("");
    return body ? `<h3>${escapeHtmlText(block.title.trim())}</h3>${body}` : "";
  }).join("");
}
