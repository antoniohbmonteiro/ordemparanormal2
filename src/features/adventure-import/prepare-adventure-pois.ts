import type { AdventurePdfTextPage } from "../../adapters/files/read-adventure-poi-pages";
import type { AdventureDefinition } from "../../core/adventure-import/adventure-definition";
import { validateAdventurePoiReferences, type AdventurePoiPreset } from "../../core/adventure-import/adventure-poi-data";
import type { PdfSourceAnalysis } from "../../core/adventure-import/recognize-pdf-source";
import type { AdventureAct } from "../../core/adventure-import/recognize-zip-source";
import { parsePlaytestAlphaPois } from "./parse-playtest-alpha-pois";

export interface AdventurePoiPreparation {
  readonly acts: readonly AdventureAct[];
  readonly presets: readonly AdventurePoiPreset[];
}

export function prepareAdventurePois(definition: AdventureDefinition, pdf: PdfSourceAnalysis,
  pages: readonly AdventurePdfTextPage[], acts: readonly AdventureAct[]): AdventurePoiPreparation {
  if (pdf.status !== "recognized" || pdf.passwordRequired || !pdf.edition
    || pdf.facts.parseAttempt.status !== "success"
    || acts.some(act => !pdf.supportedActs.includes(act))) throw new Error("PDF incompatível com os atos selecionados.");
  const presets = parsePlaytestAlphaPois(pages, acts, pdf.edition);
  validateAdventurePoiReferences(definition, presets, acts);
  return { acts: [...acts], presets };
}
