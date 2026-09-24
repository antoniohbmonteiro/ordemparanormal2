import type { AdventureAct } from "../../core/adventure-import/recognize-zip-source";
import type { PdfEditionId } from "../../core/adventure-import/known-adventure-sources";

export interface AdventurePoiSource {
  readonly id: string; readonly act: AdventureAct; readonly heading: string;
  readonly headingByEdition?: Partial<Record<PdfEditionId, string>>;
  readonly printedNumber?: number; readonly imageAssetId?: string;
  readonly informationIds: readonly string[];
  readonly contextRowIndexes?: readonly number[];
}

// Structural anchors and legacy identities only. Narrative text comes from the user-supplied PDF.
export const PLAYTEST_ALPHA_POI_REVISION = 3;
export const PLAYTEST_ALPHA_POI_SOURCES: readonly AdventurePoiSource[] = [
  { id: "actOne.character.alan", act: "actOne", heading: "Alan e seus Pertences", informationIds: ["oversizedClothes", "neckWound", "embroideredInitial"] },
  { id: "actOne.character.victor", act: "actOne", heading: "Victor e seus Pertences", informationIds: ["fadingPapers", "chalkDust", "floorDrawing"] },
  { id: "actOne.character.eloisa", act: "actOne", heading: "Elo\u00edsa e seus Pertences", informationIds: ["connectedHeadphones"] },
  { id: "actOne.character.tattoo", act: "actOne", heading: "S\u00edmbolo Tatuado nos Corpos", informationIds: ["scarAgeMedicine", "raisedScar", "pressedShape"] },
  { id: "actOne.character.edgarKenia", act: "actOne", heading: "Edgar e K\u00eania", informationIds: [] },
  { id: "actOne.map.01", act: "actOne", heading: "Dep\u00f3sito A", printedNumber: 1, informationIds: ["keysOnFloor", "keysThrown"] },
  { id: "actOne.map.02", act: "actOne", heading: "Dep\u00f3sito A, Molho de Chaves", printedNumber: 2, informationIds: ["bloodOnKeys", "matchingKeys", "smallKey"] },
  { id: "actOne.map.03", act: "actOne", heading: "Dep\u00f3sito A, Painel El\u00e9trico", printedNumber: 3, informationIds: ["breakerLabels", "obviousSecret", "otherCircuit"] },
  { id: "actOne.map.04", act: "actOne", heading: "Dep\u00f3sito B", printedNumber: 4, informationIds: ["ancientBowl", "mundaneObjects", "oldBlood", "alanWound"] },
  { id: "actOne.map.05", act: "actOne", heading: "Dep\u00f3sito B, Rabiscos no Ch\u00e3o", printedNumber: 5, informationIds: ["dragDirection", "diagram", "differentSymbol"] },
  { id: "actOne.map.06", act: "actOne", heading: "\u201cAltar\u201d de Madeira", printedNumber: 6, informationIds: ["relatedSymbols", "carvedWithBlade", "movedFurniture", "drawerRemains"] },
  { id: "actOne.map.07", act: "actOne", heading: "S\u00edmbolo no Teto", printedNumber: 7, informationIds: ["matchesWrists", "twoLayers", "rushedDrawing", "ancientLanguage"] },
  { id: "actOne.map.08", act: "actOne", heading: "Arm\u00e1rio de Metal", printedNumber: 8, informationIds: ["dangerousContents", "jacketIdentity", "backHoles", "expeditionNotes", "ancientCivilization", "ritualPurpose"] },
  { id: "actOne.map.09", act: "actOne", heading: "Celular de Gustavo", printedNumber: 9, informationIds: ["wrongDateFeeling", "savedContacts", "passwordHint", "groupConversation", "emailConfirmation", "doorApplication"] },
  { id: "actOne.map.10", act: "actOne", heading: "Duto de Ventila\u00e7\u00e3o", printedNumber: 10, informationIds: [] },
  { id: "actOne.map.11", act: "actOne", heading: "Estante de Livros", printedNumber: 11, imageAssetId: "actOne.handout.06", informationIds: ["hiddenPassage", "rearTracks", "fourConnections", "falseBooks", "floorScratches", "damagedMechanism"] },
  { id: "actOne.map.12", act: "actOne", heading: "P\u00f4ster: Lutadores de Rua", printedNumber: 12, imageAssetId: "actOne.handout.07", informationIds: ["fighterReference"] },
  { id: "actOne.map.13", act: "actOne", heading: "P\u00f4ster: Unidos do Invis\u00edvel Futebol Clube", printedNumber: 13, imageAssetId: "actOne.handout.08", informationIds: ["clubHistory", "oddDisplay"] },
  { id: "actOne.map.14", act: "actOne", heading: "P\u00f4ster: Eric Tuf\u00e3o 3 \u2013 A Explos\u00e3o Explosiva", printedNumber: 14, imageAssetId: "actOne.handout.09", informationIds: ["filmHistory", "threeExplosions"] },
  { id: "actOne.map.15", act: "actOne", heading: "P\u00f4ster: Thunderland 2008", printedNumber: 15, imageAssetId: "actOne.handout.10", informationIds: ["festivalHistory", "headlineHistory"] },
  { id: "actOne.map.16", act: "actOne", heading: "Porta de Sa\u00edda", printedNumber: 16, informationIds: ["newLock", "lockout", "remoteApp"] },
  { id: "actOne.map.17", act: "actOne", heading: "O \u00cddolo de Pedra", printedNumber: 17, informationIds: ["ancientIdol", "unpaidDebt", "baseMark", "driedBlood"] },
  { id: "actOne.map.18", act: "actOne", heading: "Mesa de Poker", printedNumber: 18, informationIds: ["fallenChair"] },
  { id: "actOne.map.19", act: "actOne", heading: "Mesa de Sinuca", printedNumber: 19, informationIds: [] },
  { id: "actOne.map.20", act: "actOne", heading: "Grelha de Churrasco", printedNumber: 20, informationIds: ["socialRoom", "unusedGrill"] },
  { id: "actOne.map.21", act: "actOne", heading: "Arm\u00e1rio de Roupas", printedNumber: 21, informationIds: ["bloodyClothes"] },
  { id: "actOne.map.22", act: "actOne", heading: "Computador", printedNumber: 22, informationIds: ["accountingPapers", "medicalReports", "emailBoxResearch"] },
  { id: "actOne.map.23", act: "actOne", heading: "Freezer", printedNumber: 23, informationIds: ["oddPadlock", "freshBlood"] },
  { id: "actOne.map.24", act: "actOne", heading: "Freezer, o Corpo", printedNumber: 24, informationIds: [] },
  { id: "actTwo.map.01", act: "actTwo", heading: "Pertences de Alan", printedNumber: 1, informationIds: ["iraqTravel", "ritualCompartments", "ritualNotes", "practice"] },
  { id: "actTwo.map.02", act: "actTwo", heading: "Pertences de Edgar", printedNumber: 2, informationIds: [] },
  { id: "actTwo.map.03", act: "actTwo", heading: "Pertences de Elo\u00edsa", printedNumber: 3, informationIds: ["strongSedatives", "bagContents", "emptyPackages"] },
  { id: "actTwo.map.04", act: "actTwo", heading: "Pertences de K\u00eania", printedNumber: 4, informationIds: ["lawMaterials", "decliningNotes"] },
  { id: "actTwo.map.05", act: "actTwo", heading: "Pertences de Victor", printedNumber: 5, informationIds: ["booksAndJewelry", "blackNotebook"] },
  { id: "actTwo.map.06", act: "actTwo", heading: "Faca de Churrasco", printedNumber: 6, informationIds: [] },
  { id: "actTwo.map.07", act: "actTwo", heading: "O \u00cddolo de Pedra", printedNumber: 7, informationIds: ["ancientIdol", "baseSymbol", "baseBlood", "ancientUse", "cursedArtifact"] },
  { id: "actTwo.map.08", act: "actTwo", heading: "\u201cAltar\u201d de Madeira", printedNumber: 8, informationIds: ["relatedSymbols", "bladeMarks", "movedFurniture", "drawerRemains"] },
  { id: "actTwo.map.09", act: "actTwo", heading: "S\u00edmbolo no Teto", printedNumber: 9, informationIds: ["ancientLanguage", "sameMark", "twoLayers", "rushedLayer"] },
  { id: "actTwo.map.10", act: "actTwo", heading: "Dep\u00f3sito A", printedNumber: 10, informationIds: ["keysOnFloor", "keysThrown"] },
  { id: "actTwo.map.11", act: "actTwo", heading: "Dep\u00f3sito A, Molho de Chaves", printedNumber: 11, informationIds: ["bloodOnKeys", "matchingKeys", "smallPadlockKey"] },
  { id: "actTwo.map.12", act: "actTwo", heading: "Dep\u00f3sito A, Painel El\u00e9trico", printedNumber: 12, informationIds: ["breakerLabels", "obviousSecret", "separateCircuit"] },
  { id: "actTwo.map.13", act: "actTwo", heading: "Dep\u00f3sito B", printedNumber: 13, informationIds: ["ancientBowl", "mundaneObjects", "mixedStains", "bloodAges", "ritualBowl"] },
  { id: "actTwo.map.14", act: "actTwo", heading: "Dep\u00f3sito B, Rabiscos no Ch\u00e3o", printedNumber: 14, informationIds: ["remainingDiagram", "differentSymbol"] },
  { id: "actTwo.map.15", act: "actTwo", heading: "Arm\u00e1rio de Metal", printedNumber: 15, informationIds: [] },
  { id: "actTwo.map.16", act: "actTwo", heading: "Estante de Livros", printedNumber: 16, informationIds: [] },
  { id: "actTwo.map.17", act: "actTwo", heading: "P\u00f4steres", printedNumber: 17, informationIds: [] },
  { id: "actTwo.map.18", act: "actTwo", heading: "Duto de Ventila\u00e7\u00e3o", headingByEdition: { "playtest-alpha-v1.0": "S\u00edmbolo no Teto" }, printedNumber: 18, informationIds: [] },
  { id: "actTwo.map.19", act: "actTwo", heading: "Porta de Sa\u00edda", printedNumber: 19, informationIds: [] },
  { id: "actTwo.map.20", act: "actTwo", heading: "Mesa de Poker", printedNumber: 20, informationIds: ["fallenChair"] },
  { id: "actTwo.map.21", act: "actTwo", heading: "Mesa de Sinuca", printedNumber: 21, informationIds: [] },
  { id: "actTwo.map.22", act: "actTwo", heading: "Churrasqueira", printedNumber: 22, informationIds: ["socialRoom", "grillAndVent"] },
  // The PDF repeats key rows under this heading; keep them in GM context instead of publishing them under the wrong POI.
  { id: "actTwo.map.23", act: "actTwo", heading: "Arm\u00e1rio de Roupas", printedNumber: 23, informationIds: ["bloodyClothes"], contextRowIndexes: [1, 2] },
  { id: "actTwo.map.24", act: "actTwo", heading: "Computador", printedNumber: 24, informationIds: ["accountingPapers", "medicalReport", "emailBoxResearch", "meetingDateResearch"] },
  { id: "actTwo.map.25", act: "actTwo", heading: "Freezer", printedNumber: 26, informationIds: ["removedBody", "frozenBlood", "darkBlood", "bloodTrail"] },
];

if (new Set(PLAYTEST_ALPHA_POI_SOURCES.map(source => source.id)).size !== PLAYTEST_ALPHA_POI_SOURCES.length) {
  throw new Error("Duplicate POI source identity");
}
