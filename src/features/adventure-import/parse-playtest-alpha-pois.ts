import { PLAYTEST_ALPHA_POI_SOURCES, type AdventurePoiSource } from "../../config/adventure-poi-sources/playtest-alpha";
import { SKILL_DEFINITIONS, type SkillKey, type AptitudeSpecializationKey } from "../../config/skills";
import { validateAdventurePoiData, type AdventurePoiPreset } from "../../core/adventure-import/adventure-poi-data";
import type { PointOfInterestApproach } from "../../documents/item/point-of-interest-data";
import type { AdventurePdfTextItem, AdventurePdfTextPage } from "../../adapters/files/read-adventure-poi-pages";
import type { AdventureAct } from "../../core/adventure-import/recognize-zip-source";
import type { PdfEditionId } from "../../core/adventure-import/known-adventure-sources";

interface PositionedItem extends AdventurePdfTextItem { readonly page: number }
interface Section { readonly source: AdventurePoiSource; readonly heading: PositionedItem; readonly items: readonly PositionedItem[] }
interface TableRow { readonly text: string; readonly skillText: string; readonly difficulty: number; readonly conditional: boolean }

const normalize = (value: string): string => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .replace(/[^A-Za-z0-9]/g, "").toUpperCase();
// Bullets and ornaments arrive as C0/C1 control or private-use glyphs; they are layout, not text.
const cleanText = (value: string): string => value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\ue000-\uf8ff]/gu, "");
const isContinuationHeading = (item: PositionedItem): boolean => item.height >= 9.9
  && item.text === item.text.toLocaleUpperCase("pt-BR") && /\(\s*CONTINUA[\u00c7C][\u00c3A]O\s*\)\s*$/u.test(item.text);
// Printed POI numbers are oversized digits placed beside the heading as a visual anchor.
const isNumberBadge = (item: PositionedItem, heading: PositionedItem): boolean => /^\d{1,2}$/u.test(item.text.trim())
  && item.height >= heading.height * 1.5;
function positionItems(page: AdventurePdfTextPage): PositionedItem[] {
  return page.items.flatMap(item => {
    const text = cleanText(item.text);
    return text.trim() ? [{ ...item, text, page: page.number }] : [];
  });
}
const conditionalQualifier = /\b(?:requer|apenas|somente|exclusiv[oa]|depois de|ap[oó]s|ao desbloquear|ao abrir|ao tocar|caso tenha|se (?:um|uma|os?|as?) (?:personage(?:m|ns)|jogadores?|algu[eé]m))\b/iu;
const conditionalInformation = /^\s*(?:(?:\(?\s*(?:requer|apenas|somente|exclusiv[oa]|depois de|ap[oó]s|caso tenha|ao (?:usar|acessar|abrir|encontrar|hackear|desbloquear)|se (?:tiver|for|houver|estiver|(?:um|uma|os?|as?) (?:personage(?:m|ns)|jogadores?|algu[eé]m)))\b)|(?:[1-9]\d?(?:\s+ou\s+[1-9]\d?)?\s+))/iu;
// Quotes are safe in HTML text. Foundry's HTML sanitizer decodes quote entities in text nodes.
const escapeHtml = (value: string): string => value.replace(/&/g, "&amp;").replace(/</g, "&lt;")
  .replace(/>/g, "&gt;");
function paragraph(value: string): string { return value.trim() ? `<p>${escapeHtml(value.trim())}</p>` : ""; }
function joinText(items: readonly PositionedItem[]): string {
  return [...items].sort((a, b) => b.y - a.y || a.x - b.x || a.order - b.order)
    .map(item => item.text.trim()).filter(Boolean).join(" ").replace(/\s+([,.;:!?])/gu, "$1")
    .replace(/([([{“])\s+/gu, "$1").replace(/\s+([)\]}”])/gu, "$1").replace(/\s+/gu, " ").trim();
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
  const cleaned = label.replace(/\([^)]*(?:requer|apenas|somente|exclusiv)[^)]*\)/giu, "").trim();
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
            rows[previous] = { ...rows[previous], skillText: lastSkill, conditional: conditionalQualifier.test(lastSkill) };
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
      for (const item of [...left, difficultyItem, ...info]) used.add(item);
      rows.push({ text, skillText: qualifier, difficulty: Number(difficultyItem.text),
        conditional: conditionalQualifier.test(qualifier) || conditionalInformation.test(text) });
    }
  }
  return { rows, used };
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
function sectionContent(input: Section): AdventurePoiPreset {
  const heading = input.heading;
  // When the section's table starts on the heading page, it marks the left edge of the section's column there;
  // text further left belongs to a neighbouring column of the page layout, not to this POI.
  const tableHeader = input.items.find(item => item.page === heading.page && normalize(item.text) === "PERICIA");
  const foreignColumn = (item: PositionedItem) => tableHeader !== undefined && item.page === heading.page
    && item.x < Math.min(heading.x, tableHeader.x) - 18;
  const section = { ...input, items: input.items.filter(item => !isContinuationHeading(item) && !isNumberBadge(item, heading)
    && !foreignColumn(item)) };
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
  const sectionConditional = headingConditional;
  const information: Array<{ id: string; content: string; approaches: readonly PointOfInterestApproach[] }> = [];
  const conditionalRows: string[] = [];
  for (const [rowIndex, row] of rows.entries()) {
    if (sectionConditional || row.conditional || contextIndexes.includes(rowIndex)) {
      conditionalRows.push(`${row.skillText} · DT ${row.difficulty}: ${row.text}`);
      continue;
    }
    const id = section.source.informationIds[information.length];
    if (!id) throw new Error(`ID de informação ausente: ${section.source.id}; linha ${rowIndex}; ${rows.map(value => `${value.skillText}:${value.difficulty}:${value.conditional}`).join("|")}.`);
    information.push({ id, content: row.text, approaches: approaches(row.skillText, row.difficulty) });
  }
  if (information.length !== section.source.informationIds.length) {
    throw new Error(`Quantidade de informações divergente: ${section.source.id} (${information.length}/${section.source.informationIds.length}; ${rows.map(row => `${row.skillText}:${row.difficulty}:${row.conditional}`).join("|")}).`);
  }
  const gmText = joinText(contextItems.filter(item => item.page !== heading.page || item.y < heading.y - 5));
  const result: AdventurePoiPreset = { id: section.source.id, act: section.source.act, name: heading.text.trim(),
    ...(section.source.imageAssetId ? { imageAssetId: section.source.imageAssetId } : {}),
    publicDescription: headingConditional ? "" : paragraph(description),
    gmContext: [headingConditional ? paragraph(description) : "", paragraph(gmText),
      ...conditionalRows.map(paragraph)].join(""), information };
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
