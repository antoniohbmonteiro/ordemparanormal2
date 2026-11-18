
import files from "./playtest-beta-files.json";

export const BETA_ID = "playtest-beta";
export const BETA_PDF_HASH = "984ac9ce6aa2ab70d49737435d70e4cb3e174470985437fae0fa1331cd8c6afc";
export const BETA_MISSIONS = ["mission1", "mission2"] as const;
export type BetaMissionId = typeof BETA_MISSIONS[number];

export const BETA_AGENTS = [
  { id: "rhiona", name: "Rhiona Mac Tuirenn", token: "Rhionna", anchor: "Rhiona", page: 1 },
  { id: "rowan", name: "Rowan Lobo Castanho", token: "Rowan", anchor: "Rowan", page: 3 },
  { id: "muirenn", name: "Muirenn da Lua Pálida", token: "Muirenn", anchor: "Muirenn", page: 5 },
  { id: "cavan", name: "Irmão Cavan do Mosteiro do Olmo Cinzento", token: "Cavan", anchor: "Cavan", page: 7 },
  { id: "malik", name: "Malik ibn Qamar", token: "Malik", anchor: "Malik", page: 9 },
  { id: "sira", name: "Sira Cissé", token: "Sira", anchor: "Sira", page: 11 },
  { id: "sorcha", name: "Sorcha Roth", token: "Sorcha", anchor: "Sorcha", page: 13 },
  { id: "cormac", name: "Cormac Coluim", token: "Cormac", anchor: "Cormac", page: 15 },
] as const;

export interface BetaPoiSection {
  page: number;
  top: number;
  bottom: number;
}

export interface BetaPoiDefinition {
  id: string;
  name: string;
  sections: readonly BetaPoiSection[];
  image?: string;
}

const section = (page: number, top = 730, bottom = 47): BetaPoiSection => ({ page, top, bottom });

export const BETA_POIS: Readonly<Record<BetaMissionId, readonly BetaPoiDefinition[]>> = {
  mission1: [
    { id: "bush", name: "Arbusto", sections: [section(37, 552)], image: "ARBUSTO" },
    { id: "tree", name: "Árvore", sections: [section(38)], image: "ARVORE" },
    { id: "cart", name: "Carroça", sections: [section(39, 730, 410)], image: "CARROÇA" },
    { id: "stones", name: "Pilha de Pedras", sections: [section(39, 407)], image: "PILHA DE PEDRA" },
    { id: "skeleton", name: "Esqueleto", sections: [section(40)], image: "ESQUELETO" },
    { id: "torch", name: "Tocha", sections: [section(41)] },
  ],
  mission2: [
    { id: "altar", name: "Altar das Vinhas", sections: [section(62, 552), section(63, 730, 385)], image: "ALTAR" },
    { id: "roots", name: "Buraco das Raízes", sections: [section(63, 383)], image: "BURACO CHAO" },
    { id: "ashes", name: "Pilha de Cinzas", sections: [section(64, 730, 411)], image: "PILHA DE CINZAS" },
    { id: "platform", name: "Plataforma Elevada", sections: [section(64, 410)], image: "PLATAFORMA ELEVADA E BAÚ" },
    { id: "chest", name: "Baú Romano", sections: [section(65, 730, 443)], image: "PLATAFORMA ELEVADA E BAÚ" },
    { id: "mist", name: "Nicho da Névoa", sections: [section(65, 442)] },
    { id: "stairs", name: "Escadaria Natural", sections: [section(66, 730, 500)], image: "ESCADA" },
    { id: "inscription", name: "Inscrição Antiga", sections: [section(66, 499)] },
    { id: "pots", name: "Potes de Argila", sections: [section(67, 730, 520)], image: "POTES" },
    { id: "monolith", name: "Monólito Pesado", sections: [section(67, 519)], image: "MONOLITO" },
    { id: "niches", name: "Nichos na Parede", sections: [], image: "NICHO PAREDE SEM RUNAS" },
  ],
};

export const BETA_THREATS = [
  { mission: "mission1", id: "drowned", name: "Afogado", page: 33, column: 232, healthY: 458, category: "Criatura", element: "Morte", tokens: ["Afogado 1", "Afogado 2"] },
  { mission: "mission1", id: "aughisk", name: "Aughisk", page: 43, column: 0, healthY: 288, category: "Criatura", element: "Morte", tokens: ["Aughisk"] },
  { mission: "mission2", id: "forest-spawn", name: "Cria da Floresta", page: 71, column: 232, healthY: 534, category: "Criatura", element: "Energia", tokens: ["Cria da floresta 1", "Cria da floresta 2"] },
] as const;

export const BETA_TRACKS = ["Névoa (Exploração)", "Trevas (Tensão)"] as const;

export const BETA_MISSION_DATA = {
  mission1: {
    ...files.mission1, name: "O Pântano dos Afogados", scene: "Ilhota", defaultMap: "MAPA 1 ILHOTA 2.jpg",
    sheet: "Fichas de personagens/Playtest beta - fichas de personagens.pdf", sheetPages: 12,
    pages: [28, 47], narrative: [
      { name: "Preparação e introdução", pages: [28, 30] },
      { name: "Os Afogados", pages: [31, 33] },
      { name: "O Aughisk", pages: [34, 45] },
      { name: "Epílogo e histórico", pages: [46, 47] },
    ], figures: "Áine e Oisín aparecem como afogados. Broccan corresponde ao Esqueleto. Uldan aparece no histórico.",
  },
  mission2: {
    ...files.mission2, name: "A Caverna de Cruachan", scene: "Caverna", defaultMap: "MAPA 2 CAVERNA v2.jpg",
    sheet: "Fichas de personagens/Playtest beta - fichas de personagens elite.pdf", sheetPages: 16,
    pages: [50, 75], narrative: [
      { name: "Preparação e introdução", pages: [50, 54] },
      { name: "Nas Profundezas da Mata", pages: [54, 59] },
      { name: "Os Enigmas Druídicos", pages: [60, 67] },
      { name: "As Crianças da Floresta", pages: [68, 71] },
      { name: "As Três Cabeças da Morte", pages: [72, 74] },
      { name: "Epílogo", pages: [75, 75] },
    ], figures: "Brenna é a druidisa da vila. O crânio de Muc Druídech é o objetivo da missão. Ellén Trechend aparece na perseguição final.",
  },
} as const;
