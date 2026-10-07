import { readFile, readdir } from "node:fs/promises";
import Handlebars from "handlebars";
import { expect, it } from "vitest";
import translations from "../../../lang/pt-BR.json";
import { createUnlockState, submitUnlockGuess } from "../../core/access-challenges/unlock";
import { projectPlayerSession, type AccessChallengeSession } from "../../application/access-challenges/session";
import { buildPlayerChallengeContext } from "./view-model";

const localize = (key: string): string => {
  const value = key.split(".").reduce<unknown>((value, part) => (value as Record<string, unknown>)[part], translations);
  if (typeof value !== "string") throw new Error(`Missing localization: ${key}`);
  return value;
};
const format = (key: string, parameters: Record<string, unknown>) =>
  localize(key).replace(/\{(\w+)\}/g, (_, name: string) => String(parameters[name]));
const h = Handlebars.create();
h.registerHelper("localize", (key: string, options: Handlebars.HelperOptions) => format(key, options.hash));
const render = async (name: string, context: object) =>
  h.compile(await readFile(new URL(`../../../templates/access-challenges/${name}.hbs`, import.meta.url), "utf8"))(context);

it("registers every Access Challenges localization key referenced by production TS and HBS", async () => {
  const directories = ["../access-challenges/", "../../application/access-challenges/", "../../features/access-challenges/",
    "../../adapters/foundry/access-challenges/", "../../../templates/access-challenges/"];
  const keys = new Set<string>();
  for (const directory of directories) {
    const url = new URL(directory, import.meta.url);
    for (const name of await readdir(url)) {
      if (name.endsWith(".test.ts") || !/\.(ts|hbs)$/.test(name)) continue;
      const source = await readFile(new URL(name, url), "utf8");
      for (const [key] of source.matchAll(/ORDEMPARANORMAL2\.AccessChallenges\.[A-Z][\w.]*/g)) keys.add(key);
    }
  }
  expect(keys.size).toBeGreaterThan(70);
  for (const key of keys) expect(() => localize(key), key).not.toThrow();
});

it("renders an optional obstacle only when present, retaining the manager summary and mandatory Break obstacle", async () => {
  const challenge = { id: "s", name: "Agente", img: "agent.png", typeClass: "unlock", typeLabel: "DESTRANCAR",
    detail: format("ORDEMPARANORMAL2.AccessChallenges.Manager.UnlockSummary", { round: 1, used: 0, total: 3 }) };
  const empty = await render("manager", { challenges: [{ ...challenge, obstacle: "" }] });
  const info = empty.match(/class="op2-access__manager-info">([\s\S]*?)<\/div>/)?.[1];
  expect(info).toBeDefined();
  expect(info).not.toContain("<span");
  expect(info).toContain("Rodada 1 · 0/3 tentativas");
  const breaking = await render("manager", { challenges: [{ ...challenge, typeClass: "break", obstacle: "Porta do Depósito" }] });
  expect(breaking).toContain("<span>Porta do Depósito</span>");
});

it("preserves visible validation, placeholder and formatted terminal wording", async () => {
  const config = await render("config", { isBreak: true, error: localize("ORDEMPARANORMAL2.AccessChallenges.Validation.Obstacle") });
  expect(config).toContain('placeholder="Ex.: Porta do Depósito"');
  expect(config).toContain("Informe o obstáculo a ser arrombado.");
  const session: AccessChallengeSession = { id: "s", gmUserId: "gm", participant: { kind: "actor", uuid: "Actor.agent" },
    participantName: "Agente", participantImg: "agent.png", obstacle: "", revision: 1, type: "unlock",
    state: submitUnlockGuess(createUnlockState([3, 5, 2], 6, 3, 6), [3, 5, 2]) };
  const html = await render("player-view", buildPlayerChallengeContext(projectPlayerSession(session), [3, 5, 2], false, "", "", localize));
  expect(html).toContain("FECHADURA DESTRANCADA");
  expect(html).toContain("A fechadura foi destrancada. O acesso está livre.");
  expect(html).toContain("Desafio superado em 1 rodada (1/3 tentativas totais)");
  expect(html).not.toContain("ORDEMPARANORMAL2.");
});
