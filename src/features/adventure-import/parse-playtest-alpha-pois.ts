import { PLAYTEST_ALPHA_POI_SOURCES, type AdventurePoiSource } from "../../config/adventure-poi-sources/playtest-alpha";
import { SKILL_DEFINITIONS, type SkillKey, type AptitudeSpecializationKey } from "../../config/skills";
import { validateAdventurePoiData, type AdventurePoiPreset } from "../../core/adventure-import/adventure-poi-data";
import { POINT_OF_INTEREST_ALWAYS_AVAILABLE, type PointOfInterestApproach,
  type PointOfInterestInformation } from "../../documents/item/point-of-interest-data";
import type { AdventurePdfTextItem, AdventurePdfTextPage } from "../../adapters/files/read-adventure-poi-pages";
import type { AdventureAct } from "../../core/adventure-import/recognize-zip-source";
import type { PdfEditionId } from "../../core/adventure-import/known-adventure-sources";
import { escapeHtmlText, renderGmContextHtml, type GmContextBlock, type GmContextContent, type GmContextEntry } from "./gm-context-html";

// A marker is a bullet or icon glyph with no text of its own; only its position is structural.
interface PositionedItem extends AdventurePdfTextItem { readonly page: number; readonly marker?: true }
interface Section { readonly source: AdventurePoiSource; readonly heading: PositionedItem; readonly items: readonly PositionedItem[] }
interface TableVariant { readonly label: string; readonly text: string }
interface TableRow {
  readonly text: string; readonly skillText: string; readonly difficulty: number; readonly conditional: boolean;
  readonly variants?: readonly TableVariant[];
  /** Second DT of a cell printed "6 ou 10"; `difficulty` holds the first one. */
  readonly alternativeDifficulty?: number;
}

const normalize = (value: string): string => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .replace(/[^A-Za-z0-9]/g, "").toUpperCase();
// Bullets and ornaments arrive as C0/C1 control or private-use glyphs; they are layout, not text.
const cleanText = (value: string): string => value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\ue000-\uf8ff]/gu, "");
const continuationSuffix = /\(\s*CONTINUA[\u00c7C][\u00c3A]O\s*\)\s*$/u;
const isContinuationHeading = (item: PositionedItem): boolean => item.height >= 9.9
  && item.text === item.text.toLocaleUpperCase("pt-BR") && continuationSuffix.test(item.text);
// Printed POI numbers are oversized digits placed beside the heading as a visual anchor.
const isNumberBadge = (item: PositionedItem, heading: PositionedItem): boolean => /^\d{1,2}$/u.test(item.text.trim())
  && item.height >= heading.height * 1.5;
function positionItems(page: AdventurePdfTextPage): PositionedItem[] {
  return page.items.flatMap(item => {
    const text = cleanText(item.text);
    if (text.trim()) return [{ ...item, text, page: page.number }];
    return /[\u0080-\u009f]/u.test(item.text) ? [{ ...item, text: "", page: page.number, marker: true as const }] : [];
  });
}
const conditionalQualifier = /\b(?:requer|apenas|somente|exclusiv[oa]|depois de|ap[oó]s|ao desbloquear|ao abrir|ao tocar|caso tenha|se (?:um|uma|os?|as?) (?:personage(?:m|ns)|jogadores?|algu[eé]m))\b/iu;
const conditionalInformation = /^\s*(?:(?:\(?\s*(?:requer|apenas|somente|exclusiv[oa]|depois de|ap[oó]s|caso tenha|ao (?:usar|acessar|abrir|encontrar|hackear|desbloquear)|se (?:tiver|for|houver|estiver|(?:um|uma|os?|as?) (?:personage(?:m|ns)|jogadores?|algu[eé]m)))\b)|(?:[1-9]\d?(?:\s+ou\s+[1-9]\d?)?\s+))/iu;
// A prerequisite printed beside a skill name, e.g. "Intuição (apenas Victor e Alan)".
const prerequisiteParenthetical = /\([^)]*(?:requer|apenas|somente|exclusiv)[^)]*\)/giu;
function paragraph(value: string): string { return value.trim() ? `<p>${escapeHtmlText(value.trim())}</p>` : ""; }
const tidyText = (value: string): string => value.replace(/\s+([,.;:!?])/gu, "$1").replace(/([([{“])\s+/gu, "$1")
  .replace(/\s+([)\]}”])/gu, "$1").replace(/\s+/gu, " ").trim();
function joinText(items: readonly PositionedItem[]): string {
  return tidyText([...items].sort((a, b) => b.y - a.y || a.x - b.x || a.order - b.order)
    .map(item => item.text.trim()).filter(Boolean).join(" "));
}
function sectionStarts(pages: readonly AdventurePdfTextPage[], act: AdventureAct, edition: PdfEditionId): readonly Section[] {
  const sources = PLAYTEST_ALPHA_POI_SOURCES.filter(source => source.act === act);
  const items = pages.filter(page => act === "actOne" ? page.number >= 35 && page.number <= 59
    : page.number >= 82 && page.number <= 100)
    .flatMap(page => positionItems(page).filter(item => item.y >= 55));
  const starts = sources.map(source => {
    const heading = source.headingByEdition?.[edition] ?? source.heading;
    const candidates = items.filter(item => item.height >= 9.9 && item.text === item.text.toLocaleUpperCase("pt-BR")
      && normalize(item.text) === normalize(heading));
    const matches = candidates.length > 1 && source.printedNumber ? candidates.filter(item => items.some(number =>
      number.page === item.page && /^\d{1,2}$/u.test(number.text.trim()) && Number(number.text.trim()) === source.printedNumber
      && number.x > item.x && Math.abs(number.y - item.y) <= 22)) : candidates;
    if (matches.length !== 1) throw new Error(`Cabeçalho de POI ausente ou ambíguo: ${source.id} (${matches.map(item => `${item.page}:${item.order}`).join(",")}).`);
    return { source, heading: matches[0] };
  }).sort((a, b) => a.heading.page - b.heading.page || b.heading.y - a.heading.y);
  return starts.map((start, index) => {
    const end = starts[index + 1]?.heading;
    return { ...start, items: items.filter(item => {
      if (item.page < start.heading.page || (item.page === start.heading.page && item.y > start.heading.y + 1)) return false;
      if (end && (item.page > end.page || (item.page === end.page && item.y <= end.y + 1))) return false;
      return true;
    }) };
  });
}
const skills = SKILL_DEFINITIONS.flatMap(def => [[def.label, def.key] as const,
  ...("specializations" in def ? def.specializations.map(spec => [`${def.label} (${spec.label})`, `${def.key}:${spec.key}`] as const) : [])])
  .sort((a, b) => b[0].length - a[0].length);
const startsWithSkill = (text: string): boolean => skills.some(([name]) => normalize(text).startsWith(normalize(name)));
function approaches(label: string, difficulty: number): readonly PointOfInterestApproach[] {
  const cleaned = label.replace(prerequisiteParenthetical, "").trim();
  const parts = cleaned.split(/\s+ou\s+/iu);
  const result: PointOfInterestApproach[] = [];
  for (const part of parts) {
    const normalized = normalize(part);
    const match = skills.find(([name]) => normalize(name) === normalized);
    if (!match) throw new Error(`Perícia de POI não reconhecida: ${label}.`);
    const [skill, specialization] = match[1].split(":") as [SkillKey, AptitudeSpecializationKey | undefined];
    result.push(skill === "aptitude"
      ? { skill, specialization: specialization!, difficulty, showDifficultyToPlayers: false }
      : { skill, difficulty, showDifficultyToPlayers: false });
  }
  return result;
}
function tableRows(section: Section): { readonly rows: readonly TableRow[]; readonly used: ReadonlySet<PositionedItem> } {
  const items = section.items;
  const used = new Set<PositionedItem>();
  const skillHeaders = items.filter(item => normalize(item.text) === "PERICIA");
  const headers = skillHeaders.flatMap(skill => {
    const difficulty = items.find(item => item.page === skill.page && normalize(item.text) === "DT" && Math.abs(item.y - skill.y) <= 4 && item.x > skill.x);
    const information = items.find(item => item.page === skill.page && normalize(item.text) === "INFORMACAO" && Math.abs(item.y - skill.y) <= 4
      && item.x > (difficulty?.x ?? Infinity));
    return difficulty && information ? [{ skill, difficulty, information }] : [];
  }).sort((a, b) => a.skill.page - b.skill.page || a.skill.order - b.skill.order);
  if (headers.length !== skillHeaders.length) throw new Error(`Cabeçalho de quadro inválido: ${section.source.id}.`);
  const rows: TableRow[] = [];
  for (const [headerIndex, header] of headers.entries()) {
    used.add(header.skill); used.add(header.difficulty); used.add(header.information);
    const nextHeader = headers[headerIndex + 1];
    const afterHeader = (item: PositionedItem) => item.page > header.skill.page
      || item.page === header.skill.page && item.order > header.information.order;
    const beforeNext = (item: PositionedItem) => !nextHeader || item.page < nextHeader.skill.page
      || item.page === nextHeader.skill.page && item.order < nextHeader.skill.order;
    const table = items.filter(item => afterHeader(item) && beforeNext(item));
    const difficultyItems = table.filter(item => /^\d{1,2}$/u.test(item.text.trim())
      && Math.abs(item.x - header.difficulty.x) <= 20 && Number(item.text) >= 1
      && (item.page > header.skill.page || item.y < header.skill.y - 4)
      && table.some(info => info.page === item.page && info.x >= header.information.x - 13 && Math.abs(info.y - item.y) <= 22));
    if (!difficultyItems.length && table.some(item => startsWithSkill(item.text))) {
      throw new Error(`Quadro sem linhas válidas: ${section.source.id}.`);
    }
    // A table continued on the next page has no header there and may sit at another indentation;
    // anchor that page's skill column on the leftmost skill label beside its own difficulty cells.
    const skillColumnX = (page: number): number => {
      if (page === header.skill.page) return header.skill.x;
      const labels = table.filter(item => item.page === page && item.x < header.difficulty.x - 5 && startsWithSkill(item.text)
        && difficultyItems.some(difficulty => difficulty.page === page && difficulty.x > item.x && Math.abs(difficulty.y - item.y) <= 22));
      return labels.length ? Math.min(...labels.map(item => item.x)) : header.skill.x;
    };
    let lastSkill = "";
    let groupStart = rows.length;
    for (const [index, difficultyItem] of difficultyItems.entries()) {
      const previous = difficultyItems[index - 1];
      const next = difficultyItems[index + 1];
      const afterPrevious = (item: PositionedItem) => !previous || item.page > previous.page
        || item.page === previous.page && item.order > previous.order;
      const beforeCurrent = (item: PositionedItem) => item.page < difficultyItem.page
        || item.page === difficultyItem.page && item.order < difficultyItem.order;
      const beforeNextDifficulty = (item: PositionedItem) => !next || item.page < next.page
        || item.page === next.page && item.order < next.order;
      const leftCandidates = table.filter(item => afterPrevious(item) && beforeCurrent(item)
        && item.x < header.difficulty.x - 5 && item.x >= skillColumnX(item.page) - 18);
      const skillStart = leftCandidates.findIndex(item => startsWithSkill(item.text));
      const left = skillStart < 0 ? leftCandidates.filter(item => conditionalQualifier.test(item.text)) : leftCandidates.slice(skillStart);
      const skillText = joinText(left);
      if (skillText) {
        if (startsWithSkill(skillText)) {
          lastSkill = skillText;
          groupStart = rows.length;
        } else {
          lastSkill = `${lastSkill} ${skillText}`.trim();
          for (let previous = groupStart; previous < rows.length; previous++) {
            rows[previous] = { ...rows[previous], skillText: lastSkill,
              conditional: conditionalQualifier.test(lastSkill) || conditionalInformation.test(rows[previous].text)
                || rows[previous].variants !== undefined };
          }
        }
      }
      const info: PositionedItem[] = [];
      for (const item of table) {
        if (item.page < difficultyItem.page || item.page === difficultyItem.page && item.order <= difficultyItem.order) continue;
        if (!beforeNextDifficulty(item)) break;
        if (item.page !== difficultyItem.page) break;
        if (["FERRAMENTAS", "DESAFIO", "MECANICADEACESSO"].includes(normalize(item.text))) break;
        if (item.x < header.information.x - 13 && item.y < difficultyItem.y - 8) break;
        if (item.x >= header.information.x - 13 && item.x < 540 && Math.abs(item.y - difficultyItem.y) <= 70) info.push(item);
      }
      if (!info.length) throw new Error(`Informação de POI sem conteúdo: ${section.source.id}.`);
      const text = joinText(info);
      const qualifier = lastSkill;
      if (!qualifier) throw new Error(`Informação de POI sem perícia: ${section.source.id}.`);
      // A DT cell printed over two lines, "6 ou" above "10", offers a base DT and one alternative.
      const alternativeCell = table.find(item => afterPrevious(item) && beforeCurrent(item) && item.page === difficultyItem.page
        && Math.abs(item.x - header.difficulty.x) <= 20 && /^\d{1,2}\s+ou$/u.test(item.text.trim())
        && item.y > difficultyItem.y && item.y - difficultyItem.y <= 16);
      for (const item of [...left, difficultyItem, ...info, ...alternativeCell ? [alternativeCell] : []]) used.add(item);
      const variants = playerCountVariants(info);
      rows.push({ text, skillText: qualifier,
        ...alternativeCell
          ? { difficulty: Number.parseInt(alternativeCell.text, 10), alternativeDifficulty: Number(difficultyItem.text) }
          : { difficulty: Number(difficultyItem.text) },
        conditional: conditionalQualifier.test(qualifier) || conditionalInformation.test(text) || variants !== undefined,
        ...(variants ? { variants } : {}) });
    }
    // Every number printed in a cell belongs to a row. A bare number left inside the rows' area of the information
    // column is a stray layout glyph (it arrives out of the reading flow), not text for the GM context.
    const rowsBottom = Math.min(...table.filter(item => used.has(item) && item.page === header.skill.page).map(item => item.y));
    for (const item of table) {
      if (!used.has(item) && item.page === header.skill.page && /^\d{1,2}$/u.test(item.text.trim())
        && item.x >= header.information.x - 13 && item.y < header.skill.y && item.y > rowsBottom) used.add(item);
    }
  }
  return { rows, used };
}
// A paragraph meant for one group size opens with the book's player-count icon ("3", "4 ou 5") at the cell's
// left edge. Each variant keeps the text the cell prints before the first icon.
function playerCountVariants(info: readonly PositionedItem[]): readonly TableVariant[] | undefined {
  const ordered = [...info].sort((a, b) => b.y - a.y || a.x - b.x || a.order - b.order);
  const left = Math.min(...ordered.map(item => item.x));
  const opens = (item: PositionedItem, index: number) => /^[1-9]$/u.test(item.text.trim()) && Math.abs(item.x - left) <= 1
    && ordered[index + 1] !== undefined && Math.abs(ordered[index + 1].y - item.y) <= 2;
  const first = ordered.findIndex(opens);
  if (first < 0) return undefined;
  const variants: Array<{ readonly label: PositionedItem[]; readonly text: PositionedItem[] }> = [];
  for (const [index, item] of ordered.entries()) {
    if (index < first) continue;
    const variant = variants.at(-1);
    if (opens(item, index)) variants.push({ label: [item], text: [] });
    else if (variant && !variant.text.length && /^(?:ou|ou\s+[1-9]|[1-9])$/u.test(item.text.trim())
      && Math.abs(item.y - variant.label[0].y) <= 2) variant.label.push(item);
    else variant!.text.push(item);
  }
  const common = ordered.slice(0, first);
  return variants.map(({ label, text }) => ({ label: joinText(label), text: joinText([...common, ...text]) }));
}
// The public description is the paragraph set flush under the heading. Side blocks (access challenges,
// tools, tables) and neighbouring columns start at another x, so the first misaligned line ends it.
function descriptionItems(heading: PositionedItem, remaining: readonly PositionedItem[]): PositionedItem[] {
  const column = remaining.filter(item => item.page === heading.page && item.y < heading.y - 5 && item.x >= heading.x - 3)
    .sort((a, b) => b.y - a.y || a.x - b.x);
  const lines: PositionedItem[][] = [];
  for (const item of column) {
    const line = lines.at(-1);
    if (line && Math.abs(line[0].y - item.y) <= 2) line.push(item);
    else lines.push([item]);
  }
  const result: PositionedItem[] = [];
  let prior = heading.y;
  let maxGap = 21;
  for (const line of lines) {
    const gap = prior - line[0].y;
    if (gap > maxGap || Math.abs(Math.min(...line.map(item => item.x)) - heading.x) > 3
      || line.some(item => normalize(item.text) === "PERICIA")) break;
    if (!result.length) maxGap = gap * 1.5;
    result.push(...line); prior = line[0].y;
  }
  return result;
}
// GM context layout. Items are read in content-stream order, which follows the book's text frames and
// table rows; visual lines are consecutive items sharing a baseline.
interface Line {
  readonly items: readonly PositionedItem[]; readonly page: number; readonly y: number;
  readonly x: number; readonly textX: number; readonly height: number; readonly marker: boolean;
}
function joinFlow(items: readonly PositionedItem[], uppercaseHyphens = false): string {
  const words = items.filter(item => !item.marker && item.text.trim());
  let text = "";
  for (const [index, item] of words.entries()) {
    const value = item.text.trim();
    const previous = words[index - 1];
    const lineBreak = previous !== undefined && Math.abs(previous.y - item.y) > 2;
    if (!text) text = value;
    else if (/^d\d+$/u.test(value) && /\d$/u.test(text)) text += value; // dice notation: "3" + "d6"
    else if (lineBreak && /\p{L}-$/u.test(text) && /^\p{Ll}/u.test(value)) text += value; // "entendê-" + "lo."
    else if (lineBreak && / -$/u.test(text) && (/\p{L} -$/u.test(text) && /^\p{Ll}/u.test(value)
      || uppercaseHyphens && /\p{Lu} -$/u.test(text) && /^\p{Lu}/u.test(value))) text = text.slice(0, -2) + value;
    else text += ` ${value}`;
  }
  return tidyText(text);
}
const joinLines = (lines: readonly Line[]): string => joinFlow(lines.flatMap(line => line.items));
// Small print (table cells, tool explanations) never shares a visual line with body text, even at the same
// baseline; digits and dice keep the class of the text around them.
function toLines(items: readonly PositionedItem[], heading: PositionedItem): Line[] {
  const groups: PositionedItem[][] = [];
  const small = (item: PositionedItem) => item.height < heading.height * 0.85;
  for (const item of items) {
    const group = groups.at(-1);
    const neutral = item.marker || /^(?:\d{1,2}|d\d+)$/u.test(item.text.trim());
    const classOf = group?.filter(entry => !entry.marker && !/^(?:\d{1,2}|d\d+)$/u.test(entry.text.trim())).at(-1);
    if (group && group[0].page === item.page && Math.abs(group[0].y - item.y) <= 2
      && (neutral || !classOf || small(classOf) === small(item))) group.push(item);
    else groups.push([item]);
  }
  return groups.map(group => {
    const words = group.filter(item => !item.marker);
    const body = words.reduce<PositionedItem | undefined>((best, item) => !best || item.text.length > best.text.length ? item : best, undefined);
    return { items: group, page: group[0].page, y: group[0].y, x: group[0].x, textX: words[0]?.x ?? group[0].x,
      height: body?.height ?? group[0].height, marker: group[0].marker === true };
  });
}
const lineText = (line: Line): string => joinFlow(line.items);
const isUpperCaseText = (value: string): boolean => /\p{Lu}.*\p{Lu}/u.test(value) && !/\p{Ll}/u.test(value);
// Line spacing inside a paragraph is ~1.45x the font size; paragraph breaks are wider.
const continues = (previous: Line | undefined, line: Line): boolean => previous !== undefined
  && previous.page === line.page && Math.abs(previous.y - line.y) <= previous.height * 1.75;
const sameBaseline = (previous: Line | undefined, line: Line): boolean => previous !== undefined
  && previous.page === line.page && Math.abs(previous.y - line.y) <= 2;
const isSmallPrint = (line: Line, heading: PositionedItem): boolean => line.height < heading.height * 0.85;
function isAccessAnchor(lines: readonly Line[], index: number): boolean {
  const first = lines[index].items.find(item => !item.marker);
  return first !== undefined && isUpperCaseText(first.text) && /^(?:DESAFIO|BLOQUEIO|MECANICA)/u.test(normalize(first.text))
    && normalize(lines.slice(index, index + 3).map(lineText).join(" ")).includes("ACESSO");
}
const isToolsHeading = (line: Line): boolean => line.items.length === 1 && normalize(line.items[0].text) === "FERRAMENTAS";
// Box titles are printed larger than the POI heading, or centred right above the text they introduce.
function isTitle(lines: readonly Line[], index: number, heading: PositionedItem): boolean {
  const line = lines[index];
  const next = lines[index + 1];
  if (sameBaseline(lines[index - 1], line) || line.items.length !== 1 || line.marker || isSmallPrint(line, heading)
    || !isUpperCaseText(line.items[0].text) || line.items[0].text.trim().endsWith(":")) return false;
  return line.items[0].height >= heading.height * 1.15 || next !== undefined && next.page === line.page
    && line.y - next.y > 0 && line.y - next.y <= 30 && next.x <= line.textX - 40;
}
const isBlockStart = (lines: readonly Line[], index: number, heading: PositionedItem): boolean =>
  isAccessAnchor(lines, index) || isToolsHeading(lines[index]) || isTitle(lines, index, heading);
const actionLine = /^(?:•\s*|[A-ZÀ-Ý]{3,}(?:\s+[A-ZÀ-Ý]{2,})*\s*(?:\(|-\s))/u;
// Paragraphs and bulleted lists. Aligned flows (GM text, box bodies) end where the left margin changes;
// access-challenge bodies also open an entry at each action ("ARROMBAR (…)", "• …").
function flowContent(lines: readonly Line[], start: number, end: number, heading: PositionedItem,
  options: { readonly aligned: boolean; readonly actions: boolean }): { readonly content: GmContextContent[]; readonly next: number } {
  const content: GmContextContent[] = [];
  let paragraph: Line[] = [];
  let entries: GmContextEntry[] = [];
  let entry: Line[] = [];
  let entryX = 0;
  let baseX: number | undefined;
  const flushEntry = () => { if (entry.length) entries.push({ text: joinLines(entry).replace(/^•\s*/u, "") }); entry = []; };
  const flushEntries = () => { flushEntry(); if (entries.length) content.push({ type: "entries", entries }); entries = []; };
  const flushParagraph = () => { if (paragraph.length) content.push({ type: "paragraph", text: joinLines(paragraph) }); paragraph = []; };
  let index = start;
  for (; index < end; index++) {
    const line = lines[index];
    const previous = lines[index - 1];
    // Same baseline: the rest of the visual line in another font size.
    if (index > start && sameBaseline(previous, line) && (entry.length || paragraph.length)) {
      (entry.length ? entry : paragraph).push(line);
      continue;
    }
    if (isBlockStart(lines, index, heading)) break;
    const lead = line.marker ? line.x : line.textX;
    if (options.aligned) {
      baseX ??= lead;
      const listContinuation = entry.length > 0 && Math.abs(line.textX - entryX) <= 3;
      if (Math.abs(lead - baseX) > 3 && !listContinuation) break;
    }
    const opensEntry = line.marker || options.actions && actionLine.test(lineText(line));
    if (opensEntry) {
      flushParagraph(); flushEntry();
      entry = [line];
      entryX = (line.items.find(item => !item.marker && item.text.trim() !== "•") ?? line.items[0]).x;
      continue;
    }
    if (entry.length && continues(previous, line) && Math.abs(line.textX - entryX) <= 3) { entry.push(line); continue; }
    flushEntries();
    if (paragraph.length && continues(previous, line) && (!options.aligned || Math.abs(line.textX - paragraph[0].textX) <= 3)) {
      paragraph.push(line);
    } else { flushParagraph(); paragraph = [line]; }
  }
  flushEntries(); flushParagraph();
  return { content, next: index };
}
function accessBlock(lines: readonly Line[], start: number, heading: PositionedItem): { readonly block: GmContextBlock; readonly next: number } {
  const anchor = lines[start];
  const contentX = anchor.textX + 50;
  let index = start;
  while (index < lines.length && (index === start || !isBlockStart(lines, index, heading)) && lines[index].x < contentX) index++;
  const labelItems = lines.slice(start, index).flatMap(line => line.items).filter(item => !item.marker && item.text.trim());
  const contentStart = index;
  while (index < lines.length && !isBlockStart(lines, index, heading) && lines[index].x >= contentX) index++;
  // The stacked label names the challenge ("DESAFIO DE ACESSO", then the obstacle); smaller-print
  // uppercase lines are its subtitle, and mixed-case lines are notes about it.
  const titleItems = labelItems.filter(item => isUpperCaseText(item.text) || item.text.trim() === "-");
  const kindEnd = titleItems.findIndex(item => normalize(item.text).endsWith("ACESSO")) + 1;
  const kind = joinFlow(titleItems.slice(0, kindEnd)).replace(/:$/u, "");
  const obstacle = joinFlow(titleItems.slice(kindEnd).map(item => item.height < anchor.height * 0.95 && !item.text.trim().startsWith("(")
    ? { ...item, text: `(${item.text.trim()})` } : item), true);
  const notes = joinFlow(labelItems.filter(item => !titleItems.includes(item)));
  const body = flowContent(lines, contentStart, index, heading, { aligned: false, actions: true }).content;
  return { next: index, block: { type: "section", title: obstacle ? `${kind}: ${obstacle}` : kind,
    content: [...(notes ? [{ type: "paragraph" as const, text: notes }] : []), ...body] } };
}
function labelText(lines: readonly Line[]): string {
  const parts: Line[][] = [];
  for (const [index, line] of lines.entries()) {
    if (parts.length && continues(lines[index - 1], line)) parts.at(-1)!.push(line);
    else parts.push([line]);
  }
  return parts.map(joinLines).reduce((label, part) => !label ? part : part.startsWith("(") ? `${label} ${part}` : `${label} · ${part}`, "");
}
// Tool tables are emitted row by row: the tool's label cell, then its explanation cell. Both cells are
// vertically centred on the row, which confirms each pairing; anything else stays a plain paragraph.
function toolsBlock(lines: readonly Line[], start: number, heading: PositionedItem): { readonly block: GmContextBlock; readonly next: number } {
  const runs: Array<{ readonly label: boolean; readonly lines: Line[] }> = [];
  let labelX: number | undefined;
  let index = start + 1;
  for (; index < lines.length && !isBlockStart(lines, index, heading); index++) {
    const line = lines[index];
    let label: boolean;
    if (isSmallPrint(line, heading)) label = false;
    else if (labelX !== undefined ? Math.abs(line.textX - labelX) <= 3 : !runs.length && opensToolRow(lines, index, heading)) {
      label = true; labelX = line.textX;
    } else break;
    const run = runs.at(-1);
    if (run?.label === label) run.lines.push(line);
    else runs.push({ label, lines: [line] });
  }
  const title = lineText(lines[start]);
  const center = (cell: readonly Line[]) => (cell[0].y + cell.at(-1)!.y) / 2;
  const leading = runs[0] && !runs[0].label ? [{ type: "paragraph" as const, text: joinLines(runs[0].lines) }] : [];
  const rows = runs.slice(leading.length);
  const entries: GmContextEntry[] = [];
  for (let row = 0; row < rows.length; row += 2) {
    const [label, text] = [rows[row], rows[row + 1]];
    if (!label?.label || !text || text.label || label.lines[0].page !== text.lines.at(-1)!.page
      || Math.abs(center(label.lines) - center(text.lines)) > 6) {
      return { next: index, block: { type: "section", title, content: [{ type: "paragraph", text: joinLines(runs.flatMap(run => run.lines)) }] } };
    }
    entries.push({ label: labelText(label.lines), text: joinLines(text.lines) });
  }
  return { next: index, block: { type: "section", title, content: [...leading, ...(entries.length ? [{ type: "entries" as const, entries }] : [])] } };
}
function opensToolRow(lines: readonly Line[], index: number, heading: PositionedItem): boolean {
  const line = lines[index];
  const next = lines.slice(index + 1).find(candidate => Math.abs(candidate.textX - line.textX) > 3);
  return next !== undefined && isSmallPrint(next, heading) && next.textX > line.textX + 30;
}
function gmContextBlocks(items: readonly PositionedItem[], heading: PositionedItem): GmContextBlock[] {
  const lines = toLines(items, heading);
  const blocks: GmContextBlock[] = [];
  let index = 0;
  while (index < lines.length) {
    if (isAccessAnchor(lines, index) || isToolsHeading(lines[index])) {
      const { block, next } = isToolsHeading(lines[index]) ? toolsBlock(lines, index, heading) : accessBlock(lines, index, heading);
      const previous = blocks.at(-1);
      // A tools table split across pages repeats its heading; keep it as one section.
      if (previous?.type === "section" && block.type === "section" && previous.title === block.title && isToolsHeading(lines[index])) {
        const [tail, head] = [previous.content.at(-1), block.content[0]];
        blocks[blocks.length - 1] = { ...previous, content: tail?.type === "entries" && head?.type === "entries"
          ? [...previous.content.slice(0, -1), { type: "entries", entries: [...tail.entries, ...head.entries] }, ...block.content.slice(1)]
          : [...previous.content, ...block.content] };
      } else blocks.push(block);
      index = next;
    } else if (isTitle(lines, index, heading)) {
      const { content, next } = flowContent(lines, index + 1, lines.length, heading, { aligned: true, actions: false });
      blocks.push({ type: "section", title: lineText(lines[index]), content });
      index = next;
    } else {
      const { content, next } = flowContent(lines, index, lines.length, heading, { aligned: true, actions: false });
      // An aligned flow always takes its first line; a margin change starts a new flow on the next pass.
      blocks.push(...content);
      index = next;
    }
  }
  return blocks;
}
// Loose GM text after a titled block would read as part of it; group it under the context heading.
function groupLooseContent(blocks: readonly GmContextBlock[]): GmContextBlock[] {
  const grouped: GmContextBlock[] = [];
  for (const block of blocks) {
    const last = grouped.at(-1);
    if (block.type === "section" || !grouped.some(entry => entry.type === "section")) grouped.push(block);
    else if (last?.type === "section" && last.title === GM_CONTEXT_TITLE) grouped[grouped.length - 1] = { ...last, content: [...last.content, block] };
    else grouped.push({ type: "section", title: GM_CONTEXT_TITLE, content: [block] });
  }
  return grouped;
}
const GM_CONTEXT_TITLE = "CONTEXTO";
// Conditions are GM-facing text the system never interprets: each part keeps its printed wording, unwrapped
// from parentheses and punctuated as a sentence.
function conditionText(parts: readonly string[]): string {
  return parts.map(part => tidyText(part).replace(/^\(([\s\S]*)\)$/u, "$1").trim()).filter(Boolean)
    .map(part => `${part.charAt(0).toLocaleUpperCase("pt-BR")}${part.slice(1)}${/[.!?]$/u.test(part) ? "" : "."}`)
    .join(" ");
}
// A prerequisite printed at the start of the information cell: "(Requer …) texto" or "Se um personagem …, texto".
function leadingCondition(text: string): { readonly condition: string; readonly content: string } | null {
  if (!conditionalInformation.test(text)) return null;
  const parenthetical = /^(\([^()]*\))\s*(\S[\s\S]*)$/u.exec(text);
  if (parenthetical) return { condition: parenthetical[1], content: parenthetical[2] };
  // The clause is the prerequisite and also reads as part of the information, so the content keeps it.
  const clause = /^(se\s[^,.]+),\s*\S/iu.exec(text);
  return clause ? { condition: clause[1], content: text } : null;
}
interface SituationalRow { readonly variant?: string; readonly content: string; readonly condition: string }
function situationalRows(sourceId: string, row: TableRow, sectionCondition: string): readonly SituationalRow[] {
  const shared = [sectionCondition, ...row.skillText.match(prerequisiteParenthetical) ?? []];
  const cells = row.variants ?? [{ label: "", text: row.text }];
  return cells.map(({ label, text }) => {
    const leading = leadingCondition(text);
    // Recognised as conditional, but its prerequisite cannot be separated from the text.
    if (!leading && !label && conditionalInformation.test(text)) {
      throw new Error(`Condição de informação não reconhecida: ${sourceId}; ${row.skillText} · DT ${row.difficulty}.`);
    }
    const condition = conditionText([...shared, ...leading ? [leading.condition] : [],
      ...label ? [`Apenas se o grupo tiver ${label} jogadores`] : []]);
    if (!condition) throw new Error(`Condição de informação ausente: ${sourceId}; ${row.skillText} · DT ${row.difficulty}.`);
    return { ...label ? { variant: label } : {}, content: leading?.content ?? text, condition };
  });
}
const bindingKey = (row: number, variant?: string): string => variant ? `${row}:${variant}` : String(row);
interface GmParagraph { readonly text: string; readonly before?: GmContextBlock; readonly remove: () => GmContextBlock[] }
// Removing a paragraph that split a list rejoins the list around it.
function withoutParagraph<T extends GmContextBlock>(items: readonly T[], index: number): (T | GmContextContent)[] {
  const [before, after] = [items[index - 1], items[index + 1]];
  if (before?.type === "entries" && after?.type === "entries") {
    return [...items.slice(0, index - 1), { type: "entries", entries: [...before.entries, ...after.entries] }, ...items.slice(index + 2)];
  }
  return [...items.slice(0, index), ...items.slice(index + 1)];
}
function gmParagraphs(blocks: readonly GmContextBlock[]): GmParagraph[] {
  return blocks.flatMap((block, index): GmParagraph[] => {
    if (block.type === "paragraph") return [{ text: block.text, before: blocks[index - 1], remove: () => withoutParagraph(blocks, index) }];
    if (block.type !== "section") return [];
    return block.content.flatMap((content, position): GmParagraph[] => content.type !== "paragraph" ? [] : [{
      text: content.text, before: block.content[position - 1],
      remove: () => blocks.map((value, i) => i === index ? { ...block, content: withoutParagraph(block.content, position) } : value),
    }]);
  });
}
// A DT cell printed "6 ou 10" is explained by one GM sentence moving that skill's DT "de 6 para 10", written as a
// consequence of an access action ("ARROMBAR (…) Se escolherem arrombar, …"). The action's condition and the rest of
// that sentence become the override condition, and the sentence leaves the GM context, which keeps the action.
function takeDifficultyRule(sourceId: string, blocks: readonly GmContextBlock[], skill: string, base: number,
  alternative: number): { readonly blocks: GmContextBlock[]; readonly condition: string } {
  const change = `\\bde\\s+${base}\\s+para\\s+${alternative}\\b`;
  const rules = gmParagraphs(blocks).filter(paragraph => new RegExp(change, "u").test(paragraph.text)
    && normalize(paragraph.text).includes(normalize(skill)));
  if (rules.length !== 1) throw new Error(`Regra de DT alternativa ausente ou ambígua: ${sourceId}; ${skill} · DT ${base} ou ${alternative}.`);
  const [rule] = rules;
  const action = rule.before?.type === "entries" ? rule.before.entries.at(-1)?.text ?? "" : "";
  const trigger = /(?:^|\)\s*)(se\s[^,.]+),/iu.exec(action)?.[1];
  if (!trigger) throw new Error(`Condição de DT alternativa não reconhecida: ${sourceId}; ${skill} · DT ${base} ou ${alternative}.`);
  const cause = rule.text.replace(new RegExp(`,?\\s*[^,]*${change}[^,]*$`, "u"), "");
  return { blocks: rule.remove(), condition: conditionText([trigger, cause]) };
}
function sectionContent(input: Section): AdventurePoiPreset {
  const heading = input.heading;
  // When the section's table starts on the heading page, it marks the left edge of the section's column there;
  // text further left belongs to a neighbouring column of the page layout, not to this POI.
  const tableHeader = input.items.find(item => item.page === heading.page && normalize(item.text) === "PERICIA");
  const foreignColumn = (item: PositionedItem) => tableHeader !== undefined && item.page === heading.page
    && item.x < Math.min(heading.x, tableHeader.x) - 18;
  // The section only resumes on a later page below its own "(CONTINUAÇÃO)" heading; anything else on those
  // pages (chapter openings, rule boxes, other rooms) is outside this POI.
  const resumeAt = new Map(input.items.filter(item => item.page !== heading.page && isContinuationHeading(item)
    && normalize(item.text.replace(continuationSuffix, "")) === normalize(heading.text)).map(item => [item.page, item.y]));
  const outsidePage = (item: PositionedItem) => item.page !== heading.page && !(item.y < (resumeAt.get(item.page) ?? -Infinity) - 1);
  const inSection = input.items.filter(item => !isContinuationHeading(item) && !isNumberBadge(item, heading)
    && !foreignColumn(item) && !outsidePage(item));
  const markers = inSection.filter(item => item.marker && item.y >= 55 && (item.page !== heading.page || item.y < heading.y - 5));
  const section = { ...input, items: inSection.filter(item => !item.marker) };
  const { rows, used } = tableRows(section);
  const contextIndexes = section.source.contextRowIndexes ?? [];
  if (new Set(contextIndexes).size !== contextIndexes.length
    || contextIndexes.some(index => !Number.isInteger(index) || index < 0 || index >= rows.length)) {
    throw new Error(`Vínculo de linha contextual inválido: ${section.source.id}.`);
  }
  const remaining = section.items.filter(item => !used.has(item) && item !== heading && item.y >= 55);
  const sameLine = remaining.filter(item => item.page === heading.page && Math.abs(item.y - heading.y) <= 5);
  const headingConditional = conditionalQualifier.test(joinText(sameLine));
  const descriptionSet = new Set(descriptionItems(heading, remaining));
  const description = joinText([...descriptionSet]);
  const contextItems = remaining.filter(item => !descriptionSet.has(item));
  const sectionCondition = headingConditional ? joinText(sameLine) : "";
  const rowSummary = () => rows.map((row, index) => `${index}:${row.skillText}:${row.difficulty}:${row.conditional}`
    + (row.variants ? `[${row.variants.map(variant => variant.label).join("/")}]` : "")).join("|");
  // Situational IDs come only from explicit catalog bindings; an unbound or unused binding aborts the import.
  const bindings = new Map((section.source.situationalInformation ?? []).map(binding =>
    [bindingKey(binding.row, binding.variant), binding.id]));
  const boundKeys = new Set<string>();
  const information: PointOfInterestInformation[] = [];
  let alwaysCount = 0;
  const gmItems = [...contextItems.filter(item => item.page !== heading.page || item.y < heading.y - 5), ...markers]
    .sort((a, b) => a.page - b.page || a.order - b.order);
  let gmBlocks = gmContextBlocks(gmItems, heading);
  // Rows kept out of information[] by the catalog stay as neutral GM context.
  const contextRows: GmContextEntry[] = [];
  for (const [rowIndex, row] of rows.entries()) {
    if (contextIndexes.includes(rowIndex)) {
      const difficulty = row.alternativeDifficulty ? `${row.difficulty} ou ${row.alternativeDifficulty}` : row.difficulty;
      contextRows.push({ label: `${row.skillText} · DT ${difficulty}`, text: row.text });
      continue;
    }
    let rowApproaches = approaches(row.skillText, row.difficulty);
    if (row.alternativeDifficulty) {
      if (rowApproaches.length !== 1) throw new Error(`DT alternativa com mais de uma perícia: ${section.source.id}; linha ${rowIndex}.`);
      const rule = takeDifficultyRule(section.source.id, gmBlocks, row.skillText, row.difficulty, row.alternativeDifficulty);
      gmBlocks = rule.blocks;
      rowApproaches = [{ ...rowApproaches[0],
        difficultyOverride: { difficulty: row.alternativeDifficulty, condition: rule.condition } }];
    }
    if (!sectionCondition && !row.conditional) {
      const id = section.source.informationIds[alwaysCount++];
      if (!id) throw new Error(`ID de informação ausente: ${section.source.id}; linha ${rowIndex}; ${rowSummary()}.`);
      information.push({ id, content: row.text, approaches: rowApproaches, availability: { ...POINT_OF_INTEREST_ALWAYS_AVAILABLE } });
      continue;
    }
    for (const entry of situationalRows(section.source.id, row, sectionCondition)) {
      const key = bindingKey(rowIndex, entry.variant);
      const id = bindings.get(key);
      if (!id) throw new Error(`ID de informação situacional ausente: ${section.source.id}; linha ${key}; ${rowSummary()}.`);
      boundKeys.add(key);
      information.push({ id, content: entry.content, approaches: rowApproaches,
        availability: { mode: "situational", condition: entry.condition } });
    }
  }
  if (alwaysCount !== section.source.informationIds.length) {
    throw new Error(`Quantidade de informações divergente: ${section.source.id} (${alwaysCount}/${section.source.informationIds.length}; ${rowSummary()}).`);
  }
  const unbound = [...bindings.keys()].filter(key => !boundKeys.has(key));
  if (unbound.length) {
    throw new Error(`Vínculo de informação situacional sem linha correspondente: ${section.source.id} (${unbound.join(", ")}; ${rowSummary()}).`);
  }
  const gmContext = renderGmContextHtml([
    ...(headingConditional && description ? [{ type: "paragraph" as const, text: description }] : []),
    ...groupLooseContent([...gmBlocks,
      ...(contextRows.length ? [{ type: "entries" as const, entries: contextRows }] : [])]),
  ]);
  const result: AdventurePoiPreset = { id: section.source.id, act: section.source.act, name: heading.text.trim(),
    ...(section.source.imageAssetId ? { imageAssetId: section.source.imageAssetId } : {}),
    publicDescription: headingConditional ? "" : paragraph(description), gmContext, information };
  validateAdventurePoiData(result);
  return result;
}
export function parsePlaytestAlphaPois(pages: readonly AdventurePdfTextPage[], acts: readonly AdventureAct[], edition: PdfEditionId): readonly AdventurePoiPreset[] {
  if (!acts.length || new Set(acts).size !== acts.length) throw new Error("Escopo de POI inválido.");
  const result: AdventurePoiPreset[] = [];
  const issues: string[] = [];
  for (const act of acts) for (const section of sectionStarts(pages, act, edition)) {
    try { result.push(sectionContent(section)); }
    catch (error) { issues.push(error instanceof Error ? error.message : String(error)); }
  }
  if (issues.length) throw new Error(issues.join("\n"));
  return result;
}

export function parsePlaytestAlphaPoiSection(source: AdventurePoiSource, page: AdventurePdfTextPage,
  ...continuation: readonly AdventurePdfTextPage[]): AdventurePoiPreset {
  const positioned = [page, ...continuation].flatMap(positionItems);
  const heading = positioned.find(item => normalize(item.text) === normalize(source.heading));
  if (!heading) throw new Error(`Cabeçalho de POI ausente: ${source.id}.`);
  return sectionContent({ source, heading, items: positioned });
}
