# Current Domain Model

## Purpose

This document records what the system currently considers stable enough to model and what is intentionally deferred.

It is not a copy of the playtest rules. It is an implementation boundary for the Foundry system.

## Actor types

### `agent`

`agent` is the only Actor type in the first implementation cycle.

No threat/enemy Actor type is currently defined because the available playtest material does not yet provide a stable threat model.

## Agent identity

Persisted source fields:

```text
level
```

`level` is an integer from 1 through 10 with initial value 1, matching the current playtest range. Profile and Occupation are not active Actor system data; each is represented by its single embedded Item. The released `system.occupation` string remains temporarily in the schema only as a hidden migration input and is not edited or used as the selected Occupation.

The Actor document itself already owns Foundry-level identity such as `name` and `img`, so those should not be duplicated inside `system` data.

## Resources

Persisted shape:

```text
resources
├── health                 PV
│   ├── value
│   └── max
└── determination          PD
│   ├── value
│   └── max
```

Resource values and maxima are integer `NumberField`s with `min: 0`, initialized to zero. In the Foundry v14 update cycle, a negative input is normalized to zero by the field rather than rejected. The persisted model intentionally permits `value > max`: manual GM edits and future temporary effects may exceed the normal maximum. Rules that restore or grant a resource are responsible for applying their own upper limit when the playtest rule requires one; the DataModel does not clamp `value` against `max`.

PV and PD are the only universal Agent resources. Ímpeto is not stored under Agent resources; the Ability that provides it owns its optional resource state.

## Profile Items

An Agent may own zero or one embedded Profile Item, and that embedded Item is the exclusive source of truth for the selected Profile. The Actor stores no Profile string, source UUID, or synchronization reference.

`ProfileDataModel` contains only an ordered Ability-grant declaration:

```text
abilityGrants[]
└── uuid                   non-embedded Item source UUID
```

The UUID points to a reusable world or compendium Ability. A Profile never embeds a complete Ability snapshot in its system data. Duplicate declarations remain readable, but editors prevent new duplicates and reconciliation uses the first occurrence.

Selecting a Profile copies only `name`, `img`, `type`, and `system.abilityGrants` from a visible world or compendium source. The embedded copy has an independent lifecycle; later source changes do not synchronize to the Agent.

Each desired grant is resolved before the Profile declaration changes. Reconciliation retains an already generated matching Ability, or treats a manually owned Ability with the same source UUID as sufficient without adopting it. Otherwise it creates a portable Ability copy marked with source and Profile-grant provenance flags. Removal and replacement delete only generated Abilities marked for that embedded Profile; unmarked, manual, and unrelated Abilities are preserved.

## Occupation Items

An Agent may own zero or one embedded Occupation Item. `OccupationDataModel` intentionally has no system fields: the current Item stores only Foundry's native `name` and `img` identity.

Selection copies a portable local snapshot from a visible world or compendium Occupation, and replacement updates the existing embedded Item in place. Occupation does not grant Abilities, own provenance, provide bonuses, or infer any mechanics in this model. Existing legacy strings are converted to local embedded Items without matching sources by name.

The system-owned `occupations` compendium provides eight reusable name-only sources: Artista, Cientista, Médico, Militar, Operário, Policial, Professor, and Profissional de Escritório. Their `system` data is empty and they contain no protected descriptions or inferred relationships.

## Point of Interest Items

`pointOfInterest` is a standalone, reusable Item type: the GM-authored **definition** of an investigation Point of Interest. It is not embedded on an Actor and holds no execution state.

Native `name` and `img` are not duplicated in `system`. `PointOfInterestDataModel` stores:

```text
publicDescription           rich text (ProseMirror / HTML)
gmContext                    rich text (ProseMirror / HTML), GM-private authoring content
showDifficultiesToPlayers    boolean, initial false
information[]
├── id                       stable identity (Foundry randomID), generated once on creation
├── skill                    canonical SkillKey from the skill registry
├── difficulty               integer ≥ 1, no upper bound (mirrors resolveCheckDifficulty)
└── content                  plain multi-line string
```

`publicDescription` and `gmContext` are declared in `system.json` as `htmlFields`. The `skill` field is constrained to `SKILL_KEYS`; the defensive reader drops any entry with a non-canonical skill, a blank id, or an out-of-range difficulty. Entry `id`s are stable across edit and removal and are the identity a future investigation-execution layer will reference (e.g. `discoveredInformationIds`). There is **no** discovered / execution state on the Item and **no** id migration (the type has never shipped).

The Point of Interest ItemSheet is a GM authoring tool. Its `_prepareContext` withholds `gmContext` and `information` from the non-GM render context and shows a GM-tool notice instead. This is a **presentation** boundary, not secure transport: POIs stay GM-only-owned in this step, and a client granted Item access can still inspect `item.system`. The future player-facing view must be a separate sanitized projection built by the Investigation Application — never the raw Item. See the "Investigation" section below and `docs/PLAYTEST_FEATURE_NOTES.md` §5.

## Attributes

Three attributes are currently stable enough to model under `system.attributes`:

```text
attributes.physical
attributes.mind
attributes.emotion
```

Player-facing labels:

```text
Físico
Mente
Emoção
```

Each attribute is represented by a `DieStep` and is initialized to `d4` for a blank Agent.

## Die steps

General domain set:

```text
d4
d6
d8
d10
d12
d20
```

Internal code uses the numeric faces as the canonical representation. `d20` is exceptional and normally requires an explicit rare or paranormal permission. The domain exposes the general set, the normal `d4` through `d12` scale, membership checks, and a generic integer step adjustment. Generic adjustment clamps within the normal scale and always preserves `d20`; transitions between `d12` and `d20` require a separate explicitly authorized rule.

Normal persisted skill values use the narrower set:

```text
d4  — Destreinado
d6  — Treinado
d8  — Especialista
d10 — Mestre
d12 — Grão Mestre
```

This is represented as `SkillDieStep = Exclude<DieStep, 20>`. A blank Agent initializes skills to `d4` as the lowest valid technical state; this is not a claim about the complete character-creation rules.

## Skills

Skills are persistent Agent data sourced from the verified list and order on pages 16–17 of the first public playtest. Static metadata lives in one canonical registry; the Actor persists only variable die values.

| Order | Key | Label | Base attribute |
| ---: | --- | --- | --- |
| 1 | `acrobatics` | Acrobacia | `physical` |
| 2 | `aptitude` | Aptidão | `mind` |
| 3 | `athletics` | Atletismo | `physical` |
| 4 | `crime` | Crime | `physical` |
| 5 | `discipline` | Disciplina | `emotion` |
| 6 | `deception` | Enganação | `emotion` |
| 7 | `stealth` | Furtividade | `physical` |
| 8 | `intimidation` | Intimidar | `emotion` |
| 9 | `intuition` | Intuição | `emotion` |
| 10 | `fighting` | Luta | `physical` |
| 11 | `machinery` | Máquinas | `mind` |
| 12 | `medicine` | Medicina | `mind` |
| 13 | `occultism` | Ocultismo | `mind` |
| 14 | `perception` | Percepção | `mind` |
| 15 | `persuasion` | Persuasão | `emotion` |
| 16 | `research` | Pesquisar | `mind` |
| 17 | `marksmanship` | Pontaria | `physical` |
| 18 | `survival` | Sobrevivência | `mind` |
| 19 | `technology` | Tecnologia | `mind` |
| 20 | `vigor` | Vigor | `physical` |

`baseAttribute` is the normal attribute used for a skill and remains canonical registry metadata rather than Actor state. A skill or Aptitude-specialization Check may select another current Agent attribute for one action without changing that default.

### Aptitude

Aptitude is one of the 20 skills and contains six independently persisted specializations:

```text
skills.aptitude
├── arts                 Artes
├── currentAffairs       Atualidades
├── bureaucracy          Burocracia
├── exactSciences        Exatas
├── humanities           Humanas
└── tactics              Tática
```

Each specialization stores its own `SkillDieStep`. Aptitude is not represented as a single number and its specializations are not separate top-level skills.

## Checks

A check is not Actor state.

The first check contract resolves current Actor data into a transient input containing one of:

```text
attribute: selected attribute die
skill: selected check attribute die (defaulting to `baseAttribute`) + selected skill die
aptitude: selected check attribute die (defaulting to `baseAttribute`) + selected specialization die
```

The normal components remain distinct from transient `extraDice`. In
`0.0.12`, manual situational extra dice use the normal `d4` through `d12`
scale, retain an occurrence ID and source label, and never update the Actor.
A check may roll at most four dice across components and extras.

A resolved check preserves:

```text
individual dice
component keys, labels, kinds, and die steps
individual results
resolved situational extra dice and their provenance
total
```

The result is transient. A versioned, serializable copy is stored with its chat message so later Actor or registry changes do not rewrite historical truth. Check-dialog step adjustments are also transient and keyed by the effective check components: each component starts at zero and may be adjusted independently before rolling. Selecting another attribute changes the attribute component's key, label, and current base die for that Check only; the same slot adjustment is then applied to that die. Neither operation updates the Actor, and the snapshot stores the effective components rather than the registry default or adjustment values. Numerical modifiers and Help automation remain outside this contract.

With up to three rolled dice, the total is the sum of every result. With four
rolled dice, the system sums the three highest results, as confirmed by a
later public explanation. All rolled results still participate in RA, RB,
positive critical, and critical-failure analysis.

`CheckSnapshotV1` and `CheckSnapshotV2` remain frozen in their historical
component-only shape. New messages use `CheckSnapshotV3`, which adds resolved
extra dice while preserving a numeric historical total and the paired DT
outcome when a difficulty was supplied.

## NEX

NEX exists as a concept in the playtest, but its persisted format is intentionally **not** part of the initial Agent model until the public material makes that representation clear enough.

Do not assume percentage storage merely because the previous system used percentages.

## Ability Items and resources

Abilities are embedded `ability` Items with plain-text description, structured cost, and at most one optional owned resource:

```text
description
cost
├── source                 none | determination | resource
└── amount                 non-negative integer
resource                   object or null
├── value                  non-negative integer
└── max                    non-negative integer
```

`value > max` and zero-cost Abilities are valid. A resource cost always consumes the optional resource on the same Ability. Removing a resource used by the cost resets the complete cost to `none / 0`.

Using an Ability has only one current effect: consume its configured cost. A free Ability performs no update, PD updates `Agent.system.resources.determination.value`, and a resource cost updates `Ability.system.resource.value`. Insufficient balances never consume partially. Rolls, chat messages, effects, recovery, and broader acquisition automation remain deferred; the only current acquisition automation is an explicit Profile UUID grant.

The Agent Sheet does not aggregate Ability resources or move them into `Agent.system`. The temporary Ability-card summary shows only `value/max`; full resource editing remains on the Ability sheet.

## Inventory

Inventory/equipment will be modeled only after the minimum stable equipment structure is clear.

Do not import category, load, weapon, armor, or modification assumptions from the previous Ordem system.

## Threats

Deferred.

No `threat` Actor type, threat Data Model, or threat sheet should be implemented until threat rules are published and reviewed.

## Combat

Deferred as a dedicated engine.

The early Agent model may expose resources and checks that are also useful during provisional combat, but no definitive initiative/attack/defense/damage architecture should be inferred from incomplete rules.

## Investigation

Investigation is an important future feature, but it should be built on top of the Agent/check foundation rather than embedded into the Agent schema prematurely.

The reusable **Point of Interest Item** (`pointOfInterest`, see above) is the first piece: GM-authored content definition only. The Investigation Application, the Examinar/Investigar/Interagir/Recapitular/Compartilhar flows, information revelation, PD consequences, and the sanitized player projection are still future work.

Potential investigation **execution** state (which information a given investigation has revealed, per Actor/scene) should be evaluated separately as scene/region/application state when that feature is planned. It must reference `information[].id`, and it must not live on the POI Item.

## Source-of-truth rule

Whenever the playtest changes:

1. update this document first if the domain assumption changed;
2. identify schema impact;
3. prefer migrations only for data that was actually persisted in a released version;
4. avoid compatibility code for internal prototypes that never shipped.

The `0.0.7` transition intentionally removes the development-only `system.profile` and `system.resources.impetus` fields without migration. Existing development Actors may be recreated or reconfigured manually.

The `0.0.8` transition relies on the `abilityGrants: []` field default for existing Profiles. Existing Abilities are never inferred, marked, or adopted by name.

The Occupation transition is versioned independently in a hidden world setting whose default is `0`. Migration 1 creates a local embedded Occupation from each non-empty legacy string before clearing that string. Conflicting pre-existing data is preserved and never resolved by name.
