import type { AdventureAct } from "../../core/adventure-import/recognize-zip-source";

export interface AdventureAgentSource {
  readonly presetKey: string; readonly documentId: string; readonly act: AdventureAct;
  readonly portraitAssetId: string; readonly tokenAssetId: string;
}

export const PLAYTEST_ALPHA_AGENT_SOURCES: readonly AdventureAgentSource[] = [
  { presetKey: "agent-01", documentId: "actOne.kenia", act: "actOne", portraitAssetId: "actOne.kenia.portrait", tokenAssetId: "actOne.kenia.token" },
  { presetKey: "agent-02", documentId: "actOne.edgar", act: "actOne", portraitAssetId: "actOne.edgar.portrait", tokenAssetId: "actOne.edgar.token" },
  { presetKey: "agent-03", documentId: "actOne.alan", act: "actOne", portraitAssetId: "actOne.alan.portrait", tokenAssetId: "actOne.alan.token" },
  { presetKey: "agent-04", documentId: "actOne.eloisa", act: "actOne", portraitAssetId: "actOne.eloisa.portrait", tokenAssetId: "actOne.eloisa.token" },
  { presetKey: "agent-05", documentId: "actOne.victor", act: "actOne", portraitAssetId: "actOne.victor.portrait", tokenAssetId: "actOne.victor.token" },
  { presetKey: "agent-06", documentId: "actTwo.val", act: "actTwo", portraitAssetId: "actTwo.val.portrait", tokenAssetId: "actTwo.val.token" },
  { presetKey: "agent-07", documentId: "actTwo.raven", act: "actTwo", portraitAssetId: "actTwo.raven.portrait", tokenAssetId: "actTwo.raven.token" },
  { presetKey: "agent-08", documentId: "actTwo.antonio", act: "actTwo", portraitAssetId: "actTwo.antonio.portrait", tokenAssetId: "actTwo.antonio.token" },
  { presetKey: "agent-09", documentId: "actTwo.amanda", act: "actTwo", portraitAssetId: "actTwo.amanda.portrait", tokenAssetId: "actTwo.amanda.token" },
  { presetKey: "agent-10", documentId: "actTwo.heitor", act: "actTwo", portraitAssetId: "actTwo.heitor.portrait", tokenAssetId: "actTwo.heitor.token" },
];
