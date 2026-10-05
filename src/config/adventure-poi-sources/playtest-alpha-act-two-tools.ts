import type { LaboratoryLength } from "../../core/equipment/laboratory-challenge";

// Canonical pack identities and original summaries. Radio text is extracted only from the user's PDF.
export const ACT_TWO_TOOL_SOURCES = {
  camera: { label: "Câmera Modificada", equipmentUuid: "Compendium.ordemparanormal2.equipment.Item.equipment0000002", useFormId: "photograph", mechanic: "standard" },
  laboratory: { label: "Laboratório Portátil", equipmentUuid: "Compendium.ordemparanormal2.equipment.Item.equipment0000003", useFormId: "analyze", mechanic: "laboratory" },
  ultraviolet: { label: "Lanterna de Estouro Ultravioleta", equipmentUuid: "Compendium.ordemparanormal2.equipment.Item.equipment0000004", useFormId: "ultraviolet-burst", mechanic: "standard" },
  infrared: { label: "Leitor Infravermelho", equipmentUuid: "Compendium.ordemparanormal2.equipment.Item.equipment0000006", useFormId: "measure", mechanic: "standard" },
  emf: { label: "Medidor EMF", equipmentUuid: "Compendium.ordemparanormal2.equipment.Item.equipment0000007", useFormId: "measure", mechanic: "standard" },
  powder: { label: "Pó Revelador", equipmentUuid: "Compendium.ordemparanormal2.equipment.Item.equipment0000008", useFormId: "reveal", mechanic: "standard" },
  radio: { label: "Rádio Modificado", equipmentUuid: "Compendium.ordemparanormal2.equipment.Item.equipment0000009", useFormId: "tune", mechanic: "radio" },
  thermometer: { label: "Termômetro Diferencial", equipmentUuid: "Compendium.ordemparanormal2.equipment.Item.equipment0000010", useFormId: "measure", mechanic: "standard" },
} as const;
export type ActTwoToolKey = keyof typeof ACT_TWO_TOOL_SOURCES;
export interface ActTwoRadioBinding {
  readonly pieceCount: number;
  readonly trueOrder: readonly number[];
  readonly correction?: { readonly index: number; readonly from: string; readonly to: string };
}
export interface ActTwoToolBinding {
  readonly poiId: string;
  readonly tool: ActTwoToolKey;
  readonly information: readonly { readonly id: string; readonly content: string; readonly condition?: string }[];
  readonly sequenceLength?: LaboratoryLength;
  readonly radio?: ActTwoRadioBinding;
  readonly gmGuidance?: string;
}
export const ACT_TWO_TOOL_BINDINGS: readonly ActTwoToolBinding[] = [
  { poiId: "actTwo.map.03", tool: "laboratory", sequenceLength: 5, information: [
    { id: "actTwo.map.03.tool.laboratory", content: "A água contém uma concentração perigosa de sedativos e saliva de pelo menos três pessoas." },
  ] },
  { poiId: "actTwo.map.05", tool: "ultraviolet", information: [
    { id: "actTwo.map.05.tool.ultraviolet", content: "As joias e o caderno continuam brilhando depois do pulso ultravioleta." },
  ] },
  { poiId: "actTwo.map.06", tool: "laboratory", sequenceLength: 4, information: [
    { id: "actTwo.map.06.tool.laboratory", content: "O sangue na faca é de Gustavo." },
    { id: "actTwo.map.06.tool.laboratory.edgarBlood", content: "Há também sangue de Edgar na faca.", condition: "Somente na variante de três jogadores, conforme decisão do mestre." },
  ], gmGuidance: "A variante de três jogadores exige revelação manual da resposta sobre Edgar." },
  { poiId: "actTwo.map.06", tool: "infrared", information: [
    { id: "actTwo.map.06.tool.infrared", content: "A leitura mostra vestígios de movimentos repetidos de facadas." },
  ] },
  { poiId: "actTwo.map.06", tool: "thermometer", information: [
    { id: "actTwo.map.06.tool.thermometer", content: "A lâmina está mais quente que o ambiente." },
  ] },
  { poiId: "actTwo.map.07", tool: "laboratory", sequenceLength: 6, information: [
    { id: "actTwo.map.07.tool.laboratory", content: "O material orgânico interno se consome e se expande de forma anormal.", condition: "Somente se o Ídolo tiver sido quebrado e seu material interno estiver acessível." },
  ], gmGuidance: "Mesmo após a análise, o mestre revela a resposta somente quando o Ídolo estiver quebrado." },
  { poiId: "actTwo.map.07", tool: "ultraviolet", information: [
    { id: "actTwo.map.07.tool.ultraviolet", content: "O pulso torna o interior visível por um instante: há material orgânico e marcas nas paredes internas." },
  ], gmGuidance: "A leitura não concede a interpretação de Ocultismo; essa perícia mantém sua condição existente." },
  { poiId: "actTwo.map.07", tool: "infrared", information: [
    { id: "actTwo.map.07.tool.infrared", content: "A leitura detecta calor e pulsação no interior do Ídolo." },
  ] },
  { poiId: "actTwo.map.07", tool: "emf", information: [
    { id: "actTwo.map.07.tool.emf", content: "O medidor registra o padrão 1–1–3." },
  ] },
  { poiId: "actTwo.map.07", tool: "powder", information: [
    { id: "actTwo.map.07.tool.powder", content: "O pó é absorvido pela superfície do Ídolo." },
    { id: "actTwo.map.07.tool.powder.darkenedInterior", content: "O material no interior escurece após o contato com o pó.", condition: "Somente quando o interior estiver visível, pela quebra ou pelo pulso ultravioleta." },
  ] },
  { poiId: "actTwo.map.07", tool: "thermometer", information: [
    { id: "actTwo.map.07.tool.thermometer", content: "A medição confirma calor no interior do Ídolo.", condition: "Somente se a medição for dirigida à boca aberta ou ao interior quebrado." },
  ] },
  { poiId: "actTwo.map.08", tool: "camera", information: [
    { id: "actTwo.map.08.tool.camera", content: "A fotografia mostra três silhuetas junto ao altar: uma segura uma tigela, outra se apoia no móvel e um corpo está sobre ele, com sigilos dourados." },
  ] },
  { poiId: "actTwo.map.08", tool: "laboratory", sequenceLength: 5, information: [
    { id: "actTwo.map.08.tool.laboratory", content: "O sangue apresenta movimento próprio e autofagia anormal." },
  ] },
  { poiId: "actTwo.map.08", tool: "infrared", information: [
    { id: "actTwo.map.08.tool.infrared", content: "Vultos se agitam em turbulência junto ao altar." },
  ] },
  { poiId: "actTwo.map.08", tool: "emf", information: [
    { id: "actTwo.map.08.tool.emf", content: "O medidor registra o padrão 1–1–3." },
  ] },
  { poiId: "actTwo.map.08", tool: "powder", information: [
    { id: "actTwo.map.08.tool.powder", content: "O sangue e o pó passam a se movimentar sobre o altar." },
  ] },
  { poiId: "actTwo.map.08", tool: "radio", radio: { pieceCount: 15, trueOrder: [2, 8, 4, 13, 0, 9, 6, 11],
    correction: { index: 8, from: "SEU FILHO,", to: "SUA FILHA," } }, information: [
    { id: "actTwo.map.08.tool.radio", content: "A transmissão justifica a violência como defesa e pressiona Eloísa a pensar na filha." },
  ] },
  { poiId: "actTwo.map.08", tool: "thermometer", information: [
    { id: "actTwo.map.08.tool.thermometer", content: "O altar está mais quente que o ambiente." },
  ] },
  { poiId: "actTwo.map.09", tool: "thermometer", information: [
    { id: "actTwo.map.09.tool.thermometer", content: "O símbolo no teto está mais quente que o ambiente." },
  ] },
  { poiId: "actTwo.map.11", tool: "laboratory", sequenceLength: 4, information: [
    { id: "actTwo.map.11.tool.laboratory", content: "O sangue nas chaves é de Gustavo." },
  ] },
  { poiId: "actTwo.map.13", tool: "camera", information: [
    { id: "actTwo.map.13.tool.camera", content: "A fotografia mostra uma silhueta caída e outra ajoelhada, concentrada no chão." },
  ], gmGuidance: "Percepção com a Câmera continua sendo uma resposta situacional resolvida pelo mestre." },
  { poiId: "actTwo.map.13", tool: "powder", information: [
    { id: "actTwo.map.13.tool.powder", content: "Os fragmentos da tigela ficam úmidos e escurecidos pelo pó." },
  ] },
  { poiId: "actTwo.map.13", tool: "radio", radio: { pieceCount: 13, trueOrder: [7, 4, 9, 2, 11, 12] }, information: [
    { id: "actTwo.map.13.tool.radio", content: "A transmissão expressa a intenção de apagar a lembrança de como realizar algo." },
  ] },
  { poiId: "actTwo.map.14", tool: "powder", information: [
    { id: "actTwo.map.14.tool.powder", content: "O pó permite visualizar a forma original do diagrama." },
  ], gmGuidance: "A interpretação de Ocultismo com Pó permanece situacional e depende do mestre." },
  { poiId: "actTwo.map.14", tool: "ultraviolet", information: [
    { id: "actTwo.map.14.tool.ultraviolet", content: "O giz destaca um símbolo dourado após o pulso ultravioleta." },
  ] },
  { poiId: "actTwo.map.23", tool: "infrared", information: [
    { id: "actTwo.map.23.tool.infrared", content: "Uma silhueta fria vasculha repetidamente o armário." },
  ] },
  { poiId: "actTwo.map.24", tool: "radio", radio: { pieceCount: 12, trueOrder: [11, 6, 4, 0, 7, 1, 9] }, information: [
    { id: "actTwo.map.24.tool.radio", content: "Alan pressiona Gustavo a repetir o ritual; Gustavo recusa matar e procura outra saída." },
  ] },
  { poiId: "actTwo.map.25", tool: "camera", information: [
    { id: "actTwo.map.25.tool.camera", content: "A fotografia mostra uma silhueta arrastando um corpo para o freezer." },
  ] },
  { poiId: "actTwo.map.25", tool: "laboratory", sequenceLength: 5, information: [
    { id: "actTwo.map.25.tool.laboratory", content: "O sangue é recente, da noite investigada." },
  ] },
  { poiId: "actTwo.map.25", tool: "ultraviolet", information: [
    { id: "actTwo.map.25.tool.ultraviolet", content: "O sangue reage ao pulso ultravioleta, afastando-se dele." },
  ] },
  { poiId: "actTwo.map.25", tool: "emf", information: [
    { id: "actTwo.map.25.tool.emf", content: "O medidor registra o padrão 1–1–1." },
  ] },
  { poiId: "actTwo.map.25", tool: "thermometer", information: [
    { id: "actTwo.map.25.tool.thermometer", content: "O frio do freezer persiste mesmo após seu desligamento.", condition: "Somente depois de desligar o freezer e verificar que o frio persiste." },
  ] },
];

export const ACT_TWO_MANUAL_TOOL_RESPONSES: readonly {
  readonly poiId: string; readonly tool: ActTwoToolKey; readonly text: string;
}[] = [
  { poiId: "actTwo.map.23", tool: "laboratory", text: "O sangue é de Gustavo. O PDF não fornece comprimento para a análise; o mestre resolve essa resposta manualmente." },
  { poiId: "actTwo.map.07", tool: "radio", text: "O rádio transmite gritos ininteligíveis. O mestre resolve essa resposta manualmente, sem puzzle ordenável." },
];
