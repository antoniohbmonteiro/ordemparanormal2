import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import Handlebars from "handlebars";
import postcss from "postcss";
import { expect, it } from "vitest";
import translations from "../../../lang/pt-BR.json";

async function presentation() {
  const handlebars = Handlebars.create();
  handlebars.registerHelper("localize", (key: string) => key.split(".").reduce((object, part) =>
    object && typeof object === "object" ? (object as Record<string, unknown>)[part] : undefined, translations as unknown) ?? key);
  const source = await readFile(fileURLToPath(new URL("../../../templates/points-of-interest/investigation-application.hbs", import.meta.url)), "utf8");
  return { source, render: handlebars.compile(source) };
}

it("renders the exact DESCOBERTAS heading after tools, independent copies and optional counters", async () => {
  const { render } = await presentation();
  const tool = { id: "e", img: "icon.svg", name: "Medidor", uses: null, canUse: true };
  const context = { isReady: true, isPlayer: true, skills: [], name: "POI", tools: [tool, { ...tool, id: "copy", uses: { value: 3, max: 5 } }],
    discoveries: [{ content: "<Pista conhecida>" }] };
  const html = render(context);
  expect(html.indexOf(">FERRAMENTAS<")).toBeLessThan(html.indexOf(">DESCOBERTAS<"));
  expect(html).toContain("3 / 5");
  expect(html).not.toContain("0 / 0");
  expect(html.match(/data-action="useTool"/g)).toHaveLength(2);
  expect(html).toContain("&lt;Pista conhecida&gt;");
  const empty = render({ ...context, tools: [] });
  expect(empty).not.toContain(">FERRAMENTAS<");
  expect(empty).toContain(">DESCOBERTAS<");
  expect(render({ ...context, tools: [], discoveries: [] })).not.toContain(">DESCOBERTAS<");
  expect(render({ ...context, tools: [{ ...tool, canUse: false }] })).toMatch(/data-action="useTool"[^>]*disabled/);
});

it("uses the GM table cells for tool references, controls and information without a DT column", async () => {
  const { render } = await presentation();
  const approach = { equipmentName: "Laser de Varredura", useFormName: "Varredura", valid: true };
  const html = render({ isReady: true, isGm: true, name: "POI", skills: [], toolInformation: [
    { id: "unknown", approaches: [approach], knownCount: 0, content: "Pista ainda não revelada." },
    { id: "known", approaches: [approach, { ...approach, valid: false }], knownCount: 2,
      content: "<Pista conhecida>", condition: "Requer a chave." },
  ] });
  const start = html.indexOf('class="op2-investigation-table is-gm op2-investigation-table--tools"');
  expect(start).toBeGreaterThan(0);
  const tools = html.slice(start, html.indexOf('<aside class="op2-investigation-gm-context"', start));
  expect(tools.match(/role="columnheader"/g)).toHaveLength(3);
  expect(tools).toContain('role="columnheader">Ferramenta</span>');
  expect(tools).toContain('role="columnheader">Controle</span>');
  expect(tools).toContain('role="columnheader">Pistas / Informações</span>');
  expect(tools).not.toMatch(/op2-investigation-difficulty|<article|op2-investigation-tool-information/);
  expect(tools).toContain("<strong>Laser de Varredura · Varredura</strong>");
  expect(tools).toMatch(/class="op2-investigation-reveal"[^>]*data-information-id="unknown">Revelar<\/button>/);
  expect(tools).toMatch(/class="op2-investigation-reveal is-revealed"[^>]*data-information-id="known">Revelada<\/button>/);
  expect(tools).toContain('class="op2-investigation-revealed">2 Agentes conhecem</span>');
  expect(tools).toContain('class="op2-investigation-situational__badge">Situacional</span>');
  expect(tools).toContain('class="op2-investigation-situational__condition">Requer a chave.</span>');
  expect(tools).toContain('class="op2-investigation-information__content">&lt;Pista conhecida&gt;</div>');
  expect(tools).toContain(translations.ORDEMPARANORMAL2.EquipmentUse.InvalidSource);
  expect(html.match(/<h3(?! class="op2-investigation-section-header")/g)).toBeNull();
  const player = render({ isReady: true, isPlayer: true, name: "POI", skills: [], tools: [], discoveries: [] });
  expect(player).not.toContain("op2-investigation-table--tools");
});

it("has one scoped header style and one short accent bar, without competing panel or GM underline rules", async () => {
  const css = postcss.parse(await readFile(fileURLToPath(new URL("../../../styles/investigation-application.css", import.meta.url)), "utf8"));
  const headers: postcss.Rule[] = [];
  css.walkRules(rule => { if (rule.selector.includes(".op2-investigation-section-header")) headers.push(rule); });
  expect(headers).toHaveLength(2);
  const heading = headers.find(rule => !rule.selector.includes("::after"))!;
  const bar = headers.find(rule => rule.selector.includes("::after"))!;
  const declarations = (rule: postcss.Rule) => Object.fromEntries(rule.nodes.filter(node => node.type === "decl")
    .map(node => [node.prop, node.value]));
  expect(declarations(heading)).toMatchObject({
    margin: "0 0 10px", padding: "0", border: "0", "font-size": "11px", "font-weight": "700",
    "text-transform": "uppercase", "letter-spacing": ".08em",
  });
  expect(declarations(heading)).not.toHaveProperty("border-bottom");
  expect(declarations(bar)).toMatchObject({ width: "40px", height: "2px", "margin-top": "6px", background: "#7f252b" });
  css.walkRules(rule => {
    expect(rule.selector).not.toMatch(/\.op2-investigation-(?:panel|gm-context)\s*>\s*h3/);
  });
});

it("lets unrevealed GM controls inherit the red accent and preserves the green revealed state and dimensions", async () => {
  const css = postcss.parse(await readFile(fileURLToPath(new URL("../../../styles/investigation-application.css", import.meta.url)), "utf8"));
  const base: Record<string, string> = {}, gm: Record<string, string> = {}, revealed: Record<string, string> = {};
  css.walkRules(rule => {
    const target = rule.selector === ".op2-poi-investigation .op2-investigation-table.is-gm .op2-investigation-reveal.is-revealed"
      ? revealed : rule.selector === ".op2-poi-investigation .op2-investigation-table.is-gm .op2-investigation-reveal"
        ? gm : rule.selectors.includes(".op2-poi-investigation .op2-investigation-reveal") ? base : null;
    if (target) rule.walkDecls(declaration => { target[declaration.prop] = declaration.value; });
  });
  expect({ ...base, ...gm }).toMatchObject({
    border: "1px solid var(--op2-accent)", background: "color-mix(in srgb, var(--op2-accent) 20%, transparent)",
    "min-width": "84px", "min-height": "30px", "border-radius": "3px", "font-size": "11px",
  });
  expect({ ...base, ...gm, ...revealed }).toMatchObject({
    "border-color": "#687e70", background: "#26352b", color: "#a9d4ad",
  });
});
