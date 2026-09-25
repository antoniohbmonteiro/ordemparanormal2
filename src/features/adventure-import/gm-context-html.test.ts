import { describe, expect, it } from "vitest";
import { renderGmContextHtml } from "./gm-context-html";

describe("GM context HTML rendering", () => {
  it("renders loose text as paragraphs and escapes markup without encoding quotes", () => {
    expect(renderGmContextHtml([
      { type: "paragraph", text: `Um "aviso" & <nota> d'água.` },
      { type: "paragraph", text: "  " },
    ])).toBe(`<p>Um "aviso" &amp; &lt;nota&gt; d'água.</p>`);
  });

  it("renders sections with headings, labelled entries and plain entries in order", () => {
    expect(renderGmContextHtml([
      { type: "section", title: "FERRAMENTAS", content: [
        { type: "paragraph", text: "Antes da lista." },
        { type: "entries", entries: [{ label: "Leitor", text: "Calor <intenso>." }, { label: "Sequência:", text: "4" }, { text: "Sem rótulo." }] },
      ] },
      { type: "paragraph", text: "Depois." },
    ])).toBe("<h3>FERRAMENTAS</h3><p>Antes da lista.</p><ul><li><p><strong>Leitor:</strong> Calor &lt;intenso&gt;.</p></li>"
      + "<li><p><strong>Sequência:</strong> 4</p></li><li><p>Sem rótulo.</p></li></ul><p>Depois.</p>");
  });

  it("omits empty sections and lists", () => {
    expect(renderGmContextHtml([
      { type: "section", title: "VAZIA", content: [{ type: "paragraph", text: "" }, { type: "entries", entries: [] }] },
      { type: "entries", entries: [{ text: " " }] },
    ])).toBe("");
  });
});
