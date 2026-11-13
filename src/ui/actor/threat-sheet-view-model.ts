import { buildActorCheck, findActorCheckSkill, parseActorCheckSelection, type Localize } from "../../application/checks/build-actor-check";
import { ATTRIBUTE_DEFINITIONS, getAttributeDefinition } from "../../config/attributes";
import { DIE_STEPS } from "../../core/dice/die-step";
import {
  THREAT_TRAIT_LISTS, THREAT_TRAIT_TEXTS, threatSkillKey, type ThreatAction, type ThreatDataModel,
} from "../../documents/actor/threat-data-model";
import { createAbilityCardViewModel, createDieStepControl, createSkillDieStepControl } from "./agent-sheet-view-model";
import type { OwnedAbilityView } from "../../adapters/foundry/abilities/owned-abilities";
import { threatAbilityRestriction } from "../../features/abilities/use-ability";
import type { AbilityCombatAction } from "../../core/abilities/ability-use";
import { localizeAbilityCost } from "../abilities/ability-cost-label";

export const THREAT_I18N = "ORDEMPARANORMAL2.ThreatSheet";

type ThreatSheetSource = Pick<ThreatDataModel,
  "category" | "elements" | "damageReduction" | "resources" | "attributes" | "skills" | "actions" | "conditions" | "characteristics"
>;

function actionCheckPreview(
  action: Pick<ThreatAction, "check"> | Pick<AbilityCombatAction, "check">,
  system: Pick<ThreatSheetSource, "attributes" | "skills">, localize: Localize,
): string {
  if (!action.check) return "";
  const selection = parseActorCheckSelection(action.check.kind, action.check.key);
  if (!selection) return "";
  const getSkillDie = ({ kind, key }: { kind: string; key: string }) =>
    system.skills.find((entry) => entry.kind === kind && entry.key === key)?.die;
  if (selection.kind !== "attribute" && getSkillDie(selection) === undefined) return "";
  return buildActorCheck(selection, { attributes: system.attributes, getSkillDie }, localize,
    action.check.attribute ?? undefined).components.map(({ die }) => `d${die}`).join(" + ");
}

export function buildThreatSheetViewModel(
  system: ThreatSheetSource,
  localize: Localize,
  applicationId: string,
  expanded: ReadonlySet<string>,
  abilities: readonly (OwnedAbilityView & { descriptionHTML?: string; useDescriptions?: ReadonlyMap<string, string> })[] = [],
  converted: ReadonlySet<string> = new Set<string>(),
  canRoll = false,
  canEditStructure = false,
) {
  const { value, max } = system.resources.health;
  const cards = abilities.map((item) => {
    const uses = item.useCollection.uses.map((use) => {
      const action = use.combatAction;
      const checkPreview = action ? actionCheckPreview(action, system, localize) : "";
      const blocked = threatAbilityRestriction(use);
      const reason = blocked === "minimum-level" ? "NeedsAgentLevel"
        : blocked === "determination" ? "NeedsDetermination"
          : action?.check && !checkPreview ? "MissingSkill"
            : use.cost.source === "health" && value < use.cost.amount ? "InsufficientAbilityCost"
              : use.cost.source === "resource" && (item.resource?.value ?? 0) < use.cost.amount ? "InsufficientAbilityCost" : "";
      return {
        id: use.id, name: use.name, itemId: item.id, isCombat: !!action,
        isCheckIntegrated: !!use.checkIntegration, threatExecutable: !use.checkIntegration,
        checkOnlyLabelKey: `${THREAT_I18N}.ModifierOnly`,
        typeLabel: action?.typeLabel, requirements: action?.requirements, checkPreview,
        unavailable: reason ? localize(`${THREAT_I18N}.${reason}`) : "",
        costLabel: use.cost.source === "none" ? "" : localizeAbilityCost(use.cost, localize),
        descriptionHTML: item.useDescriptions?.get(use.id),
        damageSummary: action?.damage ? {
          label: localize(`${THREAT_I18N}.Damage.${action.damage.timing}`), expression: action.damage.expression,
        } : null,
      };
    });
    const combat = uses.filter((use) => use.isCombat);
    const executable = uses.filter((use) => use.threatExecutable);
    const primary = executable.length === 1 ? executable[0] : undefined;
    const canUseFromHeader = canRoll && primary && !primary.unavailable;
    const summary = combat.length === 1 ? combat[0] : undefined;
    return {
      ...createAbilityCardViewModel(item),
      descriptionHTML: item.descriptionHTML ?? "",
      useForms: uses,
      combatSummary: summary && (summary.typeLabel || summary.checkPreview || summary.damageSummary) ? summary : undefined,
      headerAction: canUseFromHeader ? "useAbilityForm" : "toggleAbilityDescription",
      browseFromHeader: !canUseFromHeader,
      primaryUseId: canUseFromHeader ? primary.id : undefined,
      draggable: canEditStructure,
      showDisclosure: true,
      isExpanded: expanded.has(item.id), detailsId: `${applicationId}-ability-details-${item.id}`,
    };
  });
  const legacy = (section: string, entry: { id: string; name: string; description: string }) => {
    const id = `legacy-${section}-${entry.id}`;
    return {
      id, name: entry.name, img: "icons/svg/item-bag.svg", legacy: true, showDisclosure: true,
      plainDescription: entry.description,
      isExpanded: expanded.has(id), detailsId: `${applicationId}-ability-details-${id}`,
      headerAction: "toggleAbilityDescription", browseFromHeader: true,
    };
  };
  const legacyCards = [
    ...system.actions.filter(({ id }) => !converted.has(`actions:${id}`)).map((action) => {
      const checkPreview = actionCheckPreview(action, system, localize);
      const damageSummary = action.damage ? {
        label: localize(`${THREAT_I18N}.Damage.${action.damage.timing}`), expression: action.damage.expression,
      } : null;
      const canUse = canRoll && !!checkPreview;
      return {
        ...legacy("actions", action),
        combatSummary: { typeLabel: action.typeLabel, checkPreview, damageSummary },
        requirements: action.requirements,
        headerAction: canUse ? "rollCheck" : "toggleAbilityDescription",
        browseFromHeader: !canUse,
        legacyActionId: canUse ? action.id : undefined,
      };
    }),
    ...THREAT_TRAIT_LISTS.flatMap((key) => system.characteristics[key]
      .filter(({ id }) => !converted.has(`${key}:${id}`)).map((entry) => legacy(key, entry))),
  ];
  return {
    category: system.category,
    elements: system.elements,
    health: {
      value, max, valuePath: "system.resources.health.value", maxPath: "system.resources.health.max",
      labelKey: "ORDEMPARANORMAL2.AgentSheet.Resources.Health",
      percent: max > 0 ? Math.min(100, Math.max(0, value / max * 100)) : 0,
    },
    damageReduction: system.damageReduction,
    hasDamageReduction: system.damageReduction !== null,
    attributes: ATTRIBUTE_DEFINITIONS.map(({ key, labelKey }) => ({
      key, labelKey, die: createDieStepControl(`system.attributes.${key}`, system.attributes[key], DIE_STEPS, false),
    })),
    skills: system.skills.flatMap((skill) => {
      const definition = findActorCheckSkill(skill.kind, skill.key);
      if (!definition) return [];
      const id = threatSkillKey(skill);
      const attributeLabelKey = getAttributeDefinition(definition.baseAttribute).labelKey;
      return [{
        ...skill, id, label: definition.label, attributeLabelKey,
        searchText: `${definition.label} ${localize(attributeLabelKey)}`,
        die: createSkillDieStepControl(`skill:${id}`, skill.die),
      }];
    }),
    abilities: [...cards, ...legacyCards],
    conditions: system.conditions,
    traitTexts: THREAT_TRAIT_TEXTS.map((key) => ({
      key, labelKey: `${THREAT_I18N}.Traits.${key}`, value: system.characteristics[key],
    })),
  };
}
