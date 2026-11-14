import type { ApplicationClosingOptions } from "@client/applications/_types.mjs";
import { canManageCustomSkills, readWorldCustomSkillCatalog, saveWorldCustomSkill, subscribeCustomSkills } from "../../adapters/foundry/actors/custom-skill-catalog";
import { editDefinition } from "./custom-skills";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const ROOT = "systems/ordemparanormal2/templates/actor";

export class CustomSkillManager extends HandlebarsApplicationMixin(ApplicationV2) {
  static override DEFAULT_OPTIONS = {
    id: "ordemparanormal2-custom-skills",
    classes: ["ordemparanormal2"],
    position: { width: 470, height: "auto" as const },
    window: { title: "Perícias personalizadas", resizable: true },
    actions: { create: CustomSkillManager.#create, edit: CustomSkillManager.#edit, archive: CustomSkillManager.#archive },
  };

  static override PARTS = { main: { template: `${ROOT}/custom-skill-manager.hbs`, scrollable: [".op2-threat-editor"] } };
  #unsubscribe?: () => void;
  #editor = new AbortController();
  #editing = false;

  protected override _canRender(): boolean { return canManageCustomSkills(); }

  protected override async _prepareContext() {
    this.#unsubscribe ??= subscribeCustomSkills(() => { if (this.rendered) void this.render(); });
    const catalog = readWorldCustomSkillCatalog();
    return { tabs: undefined, valid: !!catalog, definitions: catalog?.definitions ?? [] };
  }

  protected override _onClose(options: ApplicationClosingOptions): void {
    this.#unsubscribe?.();
    this.#unsubscribe = undefined;
    this.#editor.abort();
    this.#editor = new AbortController();
    super._onClose(options);
  }

  async #editDefinition(id?: string): Promise<void> {
    const catalog = readWorldCustomSkillCatalog();
    const definition = catalog?.definitions.find(entry => entry.id === id);
    if (!catalog || (id && !definition) || this.#editing) return;
    this.#editing = true;
    try { await editDefinition(definition, this.#editor.signal); }
    catch (error) {
      console.error(error);
      ui.notifications.error("Não foi possível abrir o editor de perícia.");
    }
    finally { this.#editing = false; }
  }

  static async #create(this: CustomSkillManager) { await this.#editDefinition(); }
  static async #edit(this: CustomSkillManager, _event: PointerEvent, target: HTMLElement) {
    if (target.dataset.skillId) await this.#editDefinition(target.dataset.skillId);
  }
  static async #archive(this: CustomSkillManager, _event: PointerEvent, target: HTMLElement) {
    const definition = readWorldCustomSkillCatalog()?.definitions.find(entry => entry.id === target.dataset.skillId);
    if (!definition) return;
    try { await saveWorldCustomSkill({ ...definition, archived: !definition.archived }, definition.revision); }
    catch { ui.notifications.error("Não foi possível atualizar a perícia. Verifique se o catálogo mudou."); }
  }
}
