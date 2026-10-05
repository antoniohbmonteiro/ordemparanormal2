import {
  SKILL_DEFINITIONS,
  SKILL_DIE_STEPS,
  type SkillDieStep,
} from "../../config/skills";
import { ATTRIBUTE_DEFINITIONS } from "../../config/attributes";
import {
  type AttributeKey,
} from "../../core/actors/agent-attributes";
import { DIE_STEPS, type DieStep } from "../../core/dice/die-step";
import type { OwnedAbilityView } from "../../adapters/foundry/abilities/owned-abilities";
import type { OwnedEquipmentView } from "../../adapters/foundry/equipment/owned-equipment";
import { EQUIPMENT_CATEGORIES, type EquipmentCategory } from "../../core/equipment/equipment-category";

const RESOURCE_DEFINITIONS = [
  {
    key: "health",
    labelKey: "ORDEMPARANORMAL2.AgentSheet.Resources.Health",
  },
  {
    key: "determination",
    labelKey: "ORDEMPARANORMAL2.AgentSheet.Resources.Determination",
  },
] as const;

type ResourceKey = (typeof RESOURCE_DEFINITIONS)[number]["key"];

const SKILL_GRADE_LABEL_KEYS = {
  4: "ORDEMPARANORMAL2.AgentSheet.SkillGrades.Untrained",
  6: "ORDEMPARANORMAL2.AgentSheet.SkillGrades.Trained",
  8: "ORDEMPARANORMAL2.AgentSheet.SkillGrades.Specialist",
  10: "ORDEMPARANORMAL2.AgentSheet.SkillGrades.Master",
  12: "ORDEMPARANORMAL2.AgentSheet.SkillGrades.GrandMaster",
} as const satisfies Record<SkillDieStep, string>;

export interface AgentSheetSystemData {
  readonly occupation: string;
  readonly level: number;
  readonly resources: Readonly<
    Record<ResourceKey, { readonly value: number; readonly max: number }>
  >;
  readonly attributes: Readonly<Record<AttributeKey, DieStep>>;
  readonly skills: Readonly<
    Record<
      string,
      SkillDieStep | Readonly<Record<string, SkillDieStep>>
    >
  >;
}

export interface AgentSheetSource {
  readonly name: string;
  readonly image: string;
  readonly system: AgentSheetSystemData;
  readonly profile: {
    readonly id: string;
    readonly name: string;
    readonly img: string;
  } | null;
  readonly occupation: {
    readonly id: string;
    readonly name: string;
    readonly img: string;
  } | null;
  readonly abilities: readonly OwnedAbilityView[];
  readonly equipment: readonly OwnedEquipmentView[];
}

export interface DieStepOptionViewModel {
  readonly value: DieStep;
  readonly gradeLabelKey?: string;
  readonly selected: boolean;
}

export interface DieStepControlViewModel {
  readonly path: string;
  readonly value: DieStep;
  readonly compactLabel: string;
  readonly options: readonly DieStepOptionViewModel[];
}

export interface ResourceViewModel {
  readonly key: ResourceKey;
  readonly labelKey: string;
  readonly value: number;
  readonly max: number;
  readonly valuePath: string;
  readonly maxPath: string;
}

export interface AttributeViewModel {
  readonly key: AttributeKey;
  readonly labelKey: string;
  readonly abbreviationKey: string;
  readonly die: DieStepControlViewModel;
}

export interface SkillSpecializationViewModel {
  readonly key: string;
  readonly label: string;
  readonly die: DieStepControlViewModel;
}

export interface SimpleSkillViewModel {
  readonly key: string;
  readonly label: string;
  readonly attributeLabelKey: string;
  readonly isSpecialized: false;
  readonly die: DieStepControlViewModel;
}

export interface SpecializedSkillViewModel {
  readonly key: string;
  readonly label: string;
  readonly attributeLabelKey: string;
  readonly isSpecialized: true;
  readonly specializations: readonly SkillSpecializationViewModel[];
}

export type SkillViewModel =
  | SimpleSkillViewModel
  | SpecializedSkillViewModel;

export interface AbilityResourceViewModel {
  readonly value: number;
  readonly max: number;
  readonly fillPercentage: number;
  readonly canDecrease: boolean;
  readonly canIncrease: boolean;
}

export interface AbilityCardViewModel
  extends Omit<OwnedAbilityView, "resource"> {
  readonly resource: AbilityResourceViewModel | null;
  readonly descriptionHTML: string;
  readonly useForms: readonly AbilityUseFormViewModel[];
  readonly isExpanded: boolean;
  readonly detailsId: string;
}

export interface AbilityUseFormViewModel {
  readonly id: string;
  readonly name: string;
  readonly descriptionHTML: string;
  readonly isCheckIntegrated: boolean;
}

export interface EquipmentUsesViewModel {
  readonly value: number;
  readonly max: number;
  readonly fillPercentage: number;
  readonly canDecrease: boolean;
  readonly canIncrease: boolean;
}

export interface EquipmentCardViewModel
  extends Omit<OwnedEquipmentView, "uses" | "quantity"> {
  readonly uses: EquipmentUsesViewModel | null;
  readonly hasUses: boolean;
  readonly categoryLabelKey: string;
  readonly quantity: {
    readonly value: number;
    readonly canDecrease: boolean;
    readonly canIncrease: boolean;
  } | null;
  readonly descriptionHTML: string;
  readonly isExpanded: boolean;
  readonly detailsId: string;
}

export interface EquipmentSectionViewModel {
  readonly category: EquipmentCategory;
  readonly labelKey: string;
  readonly items: readonly EquipmentCardViewModel[];
}

export function buildEquipmentSections(
  cards: readonly EquipmentCardViewModel[],
): readonly EquipmentSectionViewModel[] {
  return EQUIPMENT_CATEGORIES.map(category => ({
    category,
    labelKey: `ORDEMPARANORMAL2.AgentSheet.Inventory.Sections.${category}`,
    items: cards.filter(card => card.category === category),
  })).filter(section => section.items.length > 0);
}

export interface AgentSheetViewModel {
  readonly name: string;
  readonly image: string;
  readonly profile: {
    readonly selected: boolean;
    readonly id: string;
    readonly name: string;
    readonly img: string;
  };
  readonly occupation: {
    readonly selected: boolean;
    readonly id: string;
    readonly name: string;
    readonly img: string;
  };
  readonly level: number;
  readonly resources: readonly ResourceViewModel[];
  readonly abilities: readonly AbilityCardViewModel[];
  readonly equipment: readonly EquipmentCardViewModel[];
  readonly equipmentSections: readonly EquipmentSectionViewModel[];
  readonly attributes: readonly AttributeViewModel[];
  readonly skills: readonly SkillViewModel[];
}

function createDieStepControl(
  path: string,
  value: DieStep,
  choices: readonly DieStep[],
  includeSkillGrades: boolean,
): DieStepControlViewModel {
  return {
    path,
    value,
    compactLabel: `d${value}`,
    options: choices.map((choice) => ({
      value: choice,
      ...(includeSkillGrades
        ? { gradeLabelKey: SKILL_GRADE_LABEL_KEYS[choice as SkillDieStep] }
        : {}),
      selected: choice === value,
    })),
  };
}

function createSkillDieStepControl(
  path: string,
  value: SkillDieStep,
): DieStepControlViewModel {
  return createDieStepControl(path, value, SKILL_DIE_STEPS, true);
}

function createAbilityCardViewModel(
  ability: OwnedAbilityView,
): AbilityCardViewModel {
  const content = {
    descriptionHTML: "",
    useForms: [],
    isExpanded: false,
    detailsId: `op2-ability-details-${ability.id}`,
  };
  const resource = ability.resource;
  if (!resource) return { ...ability, ...content, resource: null };

  const unclampedPercentage =
    resource.max > 0 ? (resource.value / resource.max) * 100 : 0;
  const fillPercentage = Math.round(
    Math.min(100, Math.max(0, unclampedPercentage)) * 100,
  ) / 100;

  return {
    ...ability,
    ...content,
    resource: {
      ...resource,
      fillPercentage,
      canDecrease: resource.value > 0,
      canIncrease: resource.value < resource.max,
    },
  };
}

function createEquipmentCardViewModel(
  equipment: OwnedEquipmentView,
): EquipmentCardViewModel {
  const categoryLabelKey = `ORDEMPARANORMAL2.Equipment.Categories.${equipment.category}`;
  const content = {
    quantity: equipment.quantity === null ? null : {
      value: equipment.quantity,
      canDecrease: equipment.quantity > 0,
      canIncrease: equipment.quantity < Number.MAX_SAFE_INTEGER,
    },
    descriptionHTML: "",
    isExpanded: false,
    detailsId: `op2-equipment-details-${equipment.id}`,
  };
  const uses = equipment.uses;
  if (!uses) {
    return { ...equipment, ...content, uses: null, hasUses: false, categoryLabelKey };
  }

  const unclampedPercentage =
    uses.max > 0 ? (uses.value / uses.max) * 100 : 0;
  const fillPercentage = Math.round(
    Math.min(100, Math.max(0, unclampedPercentage)) * 100,
  ) / 100;

  return {
    ...equipment,
    ...content,
    uses: {
      ...uses,
      fillPercentage,
      canDecrease: uses.value > 0,
      canIncrease: uses.value < uses.max,
    },
    hasUses: true,
    categoryLabelKey,
  };
}

export function buildAgentSheetViewModel(
  source: AgentSheetSource,
): AgentSheetViewModel {
  const equipment = source.equipment.map(createEquipmentCardViewModel);
  const resources = RESOURCE_DEFINITIONS.map(
    ({ key, labelKey }): ResourceViewModel => ({
      key,
      labelKey,
      value: source.system.resources[key].value,
      max: source.system.resources[key].max,
      valuePath: `system.resources.${key}.value`,
      maxPath: `system.resources.${key}.max`,
    }),
  );

  const attributes = ATTRIBUTE_DEFINITIONS.map(
    ({ key, labelKey, abbreviationKey }): AttributeViewModel => ({
      key,
      labelKey,
      abbreviationKey,
      die: createDieStepControl(
        `system.attributes.${key}`,
        source.system.attributes[key],
        DIE_STEPS,
        false,
      ),
    }),
  );

  const skills = SKILL_DEFINITIONS.map((definition): SkillViewModel => {
    const attributeLabelKey = ATTRIBUTE_DEFINITIONS.find(
      ({ key }) => key === definition.baseAttribute,
    )?.labelKey;

    if (!attributeLabelKey) {
      throw new Error(
        `Missing attribute metadata for ${definition.baseAttribute}.`,
      );
    }

    if ("specializations" in definition) {
      const values = source.system.skills[definition.key] as Readonly<
        Record<string, SkillDieStep>
      >;

      return {
        key: definition.key,
        label: definition.label,
        attributeLabelKey,
        isSpecialized: true,
        specializations: definition.specializations.map(
          ({ key, label }): SkillSpecializationViewModel => ({
            key,
            label,
            die: createSkillDieStepControl(
              `system.skills.${definition.key}.${key}`,
              values[key],
            ),
          }),
        ),
      };
    }

    const value = source.system.skills[definition.key] as SkillDieStep;

    return {
      key: definition.key,
      label: definition.label,
      attributeLabelKey,
      isSpecialized: false,
      die: createSkillDieStepControl(
        `system.skills.${definition.key}`,
        value,
      ),
    };
  });

  return {
    name: source.name,
    image: source.image,
    profile: source.profile
      ? { selected: true, ...source.profile }
      : {
          selected: false,
          id: "",
          name: "",
          img: "icons/svg/item-bag.svg",
        },
    occupation: source.occupation
      ? { selected: true, ...source.occupation }
      : {
          selected: false,
          id: "",
          name: "",
          img: "icons/svg/item-bag.svg",
        },
    level: source.system.level,
    resources,
    abilities: source.abilities.map(createAbilityCardViewModel),
    equipment,
    equipmentSections: buildEquipmentSections(equipment),
    attributes,
    skills,
  };
}
