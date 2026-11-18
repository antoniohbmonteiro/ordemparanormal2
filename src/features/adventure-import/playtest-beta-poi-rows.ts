
export interface BetaPoiRowSelector {
  page: number;
  difficultyY: number;
  labels: readonly string[];
  top: number;
  bottom: number;
}

// Text bounds exclude neighboring rows and GM-only instructions.
export const BETA_POI_ROWS: Readonly<Record<string, readonly BetaPoiRowSelector[]>> = Object.fromEntries(
  Object.entries({
    bush: [[37, 434, ["Aptidão (Guerra)", "Ofício"], 441, 429]],
    tree: [
      [38, 637, ["Percepção"], 638, 638], [38, 611, ["Percepção"], 617, 605],
      [38, 572, ["Pesquisar"], 585, 561], [38, 528, ["Pesquisar"], 541, 517],
    ],
    cart: [[39, 632, ["Percepção"], 638, 626]],
    stones: [[39, 290, ["Atletismo"], 302, 278], [39, 246, ["Inspecionar"], 258, 234]],
    skeleton: [[40, 607, ["Aptidão (Guerra)", "Pontaria"], 625, 589], [40, 557, ["Inspecionar"], 569, 545]],
    torch: [
      [41, 559, ["Percepção"], 566, 554], [41, 527, ["Percepção"], 534, 522],
      [41, 483, ["Percepção"], 501, 465], [41, 433, ["Percepção"], 445, 421], [41, 389, ["Percepção"], 401, 377],
    ],
    altar: [[62, 318, ["Percepção"], 330, 306], [62, 262, ["Inspecionar"], 286, 250]],
    ashes: [
      [64, 637, ["Aptidão (Erudição)"], 638, 638], [64, 616, ["Aptidão (Erudição)"], 617, 617],
      [64, 590, ["Inspecionar"], 596, 584], [64, 552, ["Sobrevivência"], 564, 540],
    ],
    platform: [[64, 207, ["Sobrevivência"], 213, 201]],
    chest: [[65, 598, ["Ofício (Metalurgia)"], 610, 586]],
    mist: [[65, 361, ["Intuição"], 379, 343], [65, 317, ["Sobrevivência"], 323, 311]],
    stairs: [[66, 595, ["Acrobacia", "Sobrevivência"], 602, 590]],
    inscription: [
      [66, 375, ["Aptidão (Artes)", "Aptidão (Folclore)"], 381, 369],
      [66, 348, ["Aptidão (Artes)", "Aptidão (Folclore)"], 349, 349],
      [66, 328, ["Aptidão (Artes)", "Aptidão (Folclore)"], 328, 328],
    ],
    pots: [[67, 650, ["Percepção"], 651, 651]],
    monolith: [[67, 272, ["Atletismo", "Sobrevivência"], 278, 266], [67, 233, ["Percepção"], 245, 221]],
  } satisfies Record<string, readonly (readonly [number, number, readonly string[], number, number])[]>)
    .map(([id, rows]) => [id, rows.map(([page, difficultyY, labels, top, bottom]) => ({ page, difficultyY, labels, top, bottom }))]),
);
