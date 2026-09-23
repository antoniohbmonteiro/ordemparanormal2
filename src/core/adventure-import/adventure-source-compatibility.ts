import type { PdfSourceAnalysis } from "./recognize-pdf-source";
import type { AdventureAct, ZipSourceAnalysis } from "./recognize-zip-source";
import { ZIP_PACKAGE_BY_ACT } from "./known-adventure-sources";

export type ActAvailability = "ready" | "ready-with-warnings" | "unavailable" | "blocked";
export type ActAvailabilityReason = "pdf-unusable" | "pdf-act-unavailable" | "zip-not-provided" | "zip-not-recognized" | null;

export interface ActCompatibility {
  readonly act: AdventureAct;
  readonly state: ActAvailability;
  readonly reason: ActAvailabilityReason;
  readonly missingSupplementalPaths: readonly string[];
}

export function evaluateActCompatibility(
  act: AdventureAct, pdf: PdfSourceAnalysis, zip: ZipSourceAnalysis | null,
): ActCompatibility {
  const base = { act, missingSupplementalPaths: [] as readonly string[] };
  if (pdf.status !== "recognized" || pdf.passwordRequired || pdf.facts.parseAttempt.status !== "success") {
    return { ...base, state: "blocked", reason: "pdf-unusable" };
  }
  if (!pdf.supportedActs.includes(act)) return { ...base, state: "unavailable", reason: "pdf-act-unavailable" };
  if (!zip) return { ...base, state: "unavailable", reason: "zip-not-provided" };
  if (zip.status !== "recognized" || zip.edition !== ZIP_PACKAGE_BY_ACT[act]) {
    return { ...base, state: "blocked", reason: "zip-not-recognized" };
  }
  const missingSupplementalPaths = zip.missingSupplementalPaths ?? [];
  return { act, state: missingSupplementalPaths.length ? "ready-with-warnings" : "ready",
    reason: null, missingSupplementalPaths };
}

export function assertImportableActs(
  compatibility: Readonly<Record<AdventureAct, ActCompatibility>>,
  selectedActs: readonly AdventureAct[], acknowledgeWarnings: boolean,
): void {
  if (!selectedActs.length || new Set(selectedActs).size !== selectedActs.length) throw new Error("Escopo de atos inválido.");
  for (const act of selectedActs) {
    if (act !== "actOne" && act !== "actTwo") throw new Error("Escopo de atos inválido.");
    const state = compatibility[act].state;
    if (state !== "ready" && state !== "ready-with-warnings") throw new Error(`Fonte indisponível para ${act}.`);
    if (state === "ready-with-warnings" && !acknowledgeWarnings) throw new Error(`Aviso não confirmado para ${act}.`);
  }
}
