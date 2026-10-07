import type { HandlebarsTemplatePart } from "@client/applications/api/handlebars-application.mjs";
import { openChallengeConfig } from "./config";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

class AccessChallengeTypeChooser extends HandlebarsApplicationMixin(ApplicationV2) {
  static override DEFAULT_OPTIONS = {
    classes: ["ordemparanormal2", "op2-access", "op2-access-chooser"],
    position: { width: 320, height: "auto" as const },
    window: { title: "Novo Desafio de Acesso", resizable: false },
    actions: { unlock: AccessChallengeTypeChooser.#unlock, break: AccessChallengeTypeChooser.#break,
      cancel: AccessChallengeTypeChooser.#cancel },
  };
  static override PARTS: Record<string, HandlebarsTemplatePart> = {
    main: { template: "systems/ordemparanormal2/templates/access-challenges/type-chooser.hbs" },
  };
  static async #unlock(this: AccessChallengeTypeChooser): Promise<void> { await this.close(); await openChallengeConfig("unlock"); }
  static async #break(this: AccessChallengeTypeChooser): Promise<void> { await this.close(); await openChallengeConfig("break"); }
  static async #cancel(this: AccessChallengeTypeChooser): Promise<void> { await this.close(); }
}

export async function openChallengeTypeChooser(): Promise<void> {
  await new AccessChallengeTypeChooser().render({ force: true });
}
