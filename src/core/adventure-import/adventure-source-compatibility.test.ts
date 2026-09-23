import { describe, expect, it } from "vitest";

import { assertImportableActs, evaluateActCompatibility } from "./adventure-source-compatibility";
import type { PdfSourceAnalysis } from "./recognize-pdf-source";
import type { ZipSourceAnalysis } from "./recognize-zip-source";

const pdf: PdfSourceAnalysis = {
  status: "recognized", passwordRequired: false, matchMethod: "content", edition: "playtest-alpha-v1.1",
  variant: "survivors", supportedActs: ["actOne"], issues: [],
  facts: { pre: { byteLength: 10, sha256: "unknown", pdfVersion: "1.7", encryption: { present: false },
    trailerId: null, plaintextCatalogHints: null }, parseAttempt: { status: "success", facts: {
      pageCount: 66, producer: null, creator: null, lang: null, versionStampTag: "v1.1",
      contentSignatureSha256: "survivors",
    } } },
};

const actOne: ZipSourceAnalysis = { act: "actOne", status: "recognized", matchMethod: "hash",
  edition: "ato-i-extras", inventory: null, issues: [] };
const actTwo: ZipSourceAnalysis = { act: "actTwo", status: "recognized", matchMethod: "structural",
  edition: "ato-ii-extras", inventory: null, issues: [] };

describe("act compatibility", () => {
  it("allows the official survivors PDF to import Ato I without an Ato II source", () => {
    const compatibility = {
      actOne: evaluateActCompatibility("actOne", pdf, actOne),
      actTwo: evaluateActCompatibility("actTwo", pdf, null),
    };
    expect(compatibility.actOne.state).toBe("ready");
    expect(compatibility.actTwo).toMatchObject({ state: "unavailable", reason: "pdf-act-unavailable" });
    expect(() => assertImportableActs(compatibility, ["actOne"], false)).not.toThrow();
    expect(() => assertImportableActs(compatibility, ["actTwo"], false)).toThrow(/indisponível/);
  });

  it("never lets an Ato II ZIP expand survivors coverage", () => {
    expect(evaluateActCompatibility("actTwo", pdf, actTwo)).toMatchObject({
      state: "unavailable", reason: "pdf-act-unavailable",
    });
    expect(evaluateActCompatibility("actTwo", { ...pdf, variant: "agents", supportedActs: ["actOne", "actTwo"] }, actTwo)
      .state).toBe("ready");
  });

  it("requires an explicit acknowledgement only for known missing supplements", () => {
    const warningZip = { ...actTwo, missingSupplementalPaths: ["Handouts/Audio EMF 1.mp3"] };
    const agents = { ...pdf, variant: "agents" as const, supportedActs: ["actOne", "actTwo"] as const };
    const compatibility = {
      actOne: evaluateActCompatibility("actOne", agents, actOne),
      actTwo: evaluateActCompatibility("actTwo", agents, warningZip),
    };
    expect(compatibility.actTwo.state).toBe("ready-with-warnings");
    expect(() => assertImportableActs(compatibility, ["actTwo"], false)).toThrow(/confirmado/);
    expect(() => assertImportableActs(compatibility, ["actTwo"], true)).not.toThrow();
    expect(() => assertImportableActs(compatibility, [], true)).toThrow(/Escopo/);
  });
});
