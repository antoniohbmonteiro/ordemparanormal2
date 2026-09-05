# Architecture

## Status

This document defines the architecture of **Ordem Paranormal 2** for Foundry VTT. The current runtime contains the TypeScript/Vite scaffold, the Agent model and sheet, the check workflow, Profile, Occupation, and Ability Items, Profile Ability grants, the first system-owned compendiums, one optional Ability-owned resource, versioned world-data migrations, and the Community License notice.

## Goals

The system should be:

- Foundry VTT v14-first;
- modular and maintainable;
- strongly typed;
- easy to test outside Foundry where rules permit;
- resistant to playtest rule changes;
- explicit about framework boundaries;
- usable before heavy automation exists;
- safe to evolve without turning sheets or workflows into God Objects.

## Non-goals

At this stage, the project does not aim to:

- reproduce the physical character sheet exactly;
- implement rules that have not been published;
- mirror the data model of the previous Ordem Paranormal system;
- provide combat automation before the new combat rules are defined;
- model threats before threat rules exist;
- create generic framework abstractions without a real caller;
- maintain Foundry v13 compatibility.

## Architectural style

The project uses **Clean Architecture principles with pragmatic Foundry boundaries**.

The goal is dependency clarity, not ceremony.

```text
┌─────────────────────────────────────────────┐
│ Presentation                               │
│ Sheets, Applications, UI components        │
└──────────────────────┬──────────────────────┘
                       │ user intent / view models
                       ▼
┌─────────────────────────────────────────────┐
│ Features / Application orchestration        │
│ Use-case-sized coordination                 │
└──────────────────────┬──────────────────────┘
                       │ typed domain inputs
                       ▼
┌─────────────────────────────────────────────┐
│ Core domain                                 │
│ Dice, checks, invariants, rule decisions    │
└─────────────────────────────────────────────┘

Foundry boundary adapters sit beside these layers and translate
framework Documents/Rolls/Messages into typed application inputs.
```

The core must remain independent of Foundry wherever practical.

## Current source layout

```text
src/
├── main.ts
├── bootstrap/
│   ├── register-data-models.ts
│   ├── register-data-migrations.ts
│   ├── register-unique-agent-item-hooks.ts
│   └── register-sheets.ts
│
├── config/
│   ├── system-config.ts
│   └── skills.ts
│
├── core/
│   ├── abilities/
│   ├── actors/
│   │   └── agent-attributes.ts
│   └── dice/
│       └── die-step.ts
│
├── documents/
│   ├── actor/
│   │   └── agent-data-model.ts
│   └── item/
│       ├── ability-data-model.ts
│       ├── occupation-data-model.ts
│       └── profile-data-model.ts
│
├── adapters/foundry/
│   ├── abilities/
│   ├── items/
│   ├── occupations/
│   └── profiles/
│
├── features/
│   ├── abilities/
│   ├── occupations/
│   └── profiles/
├── applications/
│   ├── actor/
│   ├── item/
│   ├── items/
│   ├── occupations/
│   └── profiles/
│
└── types/
    └── foundry.d.ts
```

Tests are colocated with the pure modules they validate. Application, adapter, feature, and presentation directories will appear only when a concrete responsibility requires them. Empty architecture remains forbidden.

## Dependency rules

### `core/`

May depend on:

- other core modules;
- TypeScript/JavaScript standard language features.

Must not depend on:

- `game`, `Hooks`, `Actor`, `Item`, `Roll`, `ChatMessage`, or the `foundry` namespace;
- DOM;
- `ApplicationV2`, `DocumentSheetV2`, or other applications/sheets;
- chat rendering;
- persistence.

### `bootstrap/`

Owns lifecycle registration against Foundry. The current bootstrap associates `agent`, `profile`, `occupation`, and `ability` with their DataModels and type-limited sheets, adds synchronous uniqueness guards for Profile and Occupation, and registers settings during `init`. The bootstrap does not replace an Actor or Item document class.

Data migrations use a hidden world-scoped integer setting with default `0` and a separate current version constant. Only the active GM runs pending migrations in order during `ready`, and the setting advances only after the complete sequence succeeds. `preCreateActor` uses a separate synchronous pending-source transformation so imported legacy Agents are created atomically without database operations inside the hook.

The Community License notice is a presentation and Foundry-integration concern. Its accepted version is stored as a hidden string setting in client scope; it is never Actor, Item, User, or World data. Changing the notice version invalidates an older acceptance without requiring a data migration.

### `application/`

May depend on:

- core types and rules;
- narrow ports/interfaces needed to perform side effects.

It coordinates intent but should not know sheet markup or Foundry HTML structure.

### `adapters/foundry/`

Owns conversion between Foundry and internal models.

Examples:

- read current Agent data into a check request;
- evaluate a Foundry `Roll` for a domain/application request;
- create/update a `ChatMessage` snapshot;
- permission-aware document mutation.

### `documents/`

Owns Foundry Document/Data Model definitions and derived-data preparation specific to system documents.

Keep derived data small and deterministic. Do not move unrelated feature workflows into the Actor document class.

### `features/`

Owns cohesive user-facing capabilities that compose application/domain behavior.

A feature may contain a controller, presenter/view-model builder, or Foundry event binder when that code is specific to the feature.

### `applications/` and `ui/`

Own presentation behavior and reusable visual pieces.

They may format already-resolved data, but must not redefine game rules.

## Actor strategy

The first supported Actor type is:

```text
agent
```

No `threat` type will be created until the playtest publishes enough threat rules to define a real model.

The Agent model covers only stable identity, PV/PD, attributes, and skills verified from the public playtest. It uses `TypeDataModel` and has a production `ActorSheetV2`; no custom Actor class exists.

See [DOMAIN_MODEL.md](DOMAIN_MODEL.md).

## Data ownership

Prefer storing **source state** and deriving **presentation state**.

Examples:

- Store a die step as its domain value, not a translated UI label.
- Store `resources.health.value` and `resources.health.max`; derive the bar percentage for the sheet.
- Store only PV and PD as universal Agent resources.
- Store Ímpeto or another special counter in the optional resource of the embedded Ability that provides it.
- Store Profile grants as ordered source UUIDs, not embedded Ability snapshots or names.
- Store the selected Occupation as the single embedded `occupation` Item; do not duplicate it as active Actor system data or infer a source by name.
- Store only skill die values under `skills`; keep labels, order, and base attributes in the canonical registry.
- Do not store both `d8` and `8` for the same semantic value.

Derived values that affect rules should have a single authoritative calculation path.

## Dice-step domain

Dice steps are central enough to deserve a small dedicated domain type and runtime guard.

Initial representation:

```ts
export type DieStep = 4 | 6 | 8 | 10 | 12 | 20;
```

Current public API:

```text
NORMAL_DIE_STEPS
isDieStep
adjustDieStep
```

Normal skill values are restricted to `d4` through `d12`; `d20` remains an exceptional general-domain value. Generic integer step adjustment moves only within the normal scale, clamps at `d4` and `d12`, and preserves `d20`. Any transition between `d12` and `d20` remains deferred to an explicitly authorized exceptional rule.

## Check architecture

The current simple-check flow is:

```text
Sheet/UI interaction
      ↓
resolve current Actor values
      ↓
pure check composition from canonical metadata
      ↓
optional transient attribute selection, step adjustments, DT, and extra dice
      ↓
Check application service
      ↓
Foundry Roll adapter
      ↓
resolved `CheckResult` with individual components and total
      ↓
serialized ChatMessage snapshot
      ↓
chat presentation
```

The current result preserves the check identity, each effective component's identity, label, die and result, resolved situational dice, and the total. Skill and Aptitude checks default to the registry's `baseAttribute`, while the application may rebuild that transient input with another current Agent attribute selected in the dialog. The domain, Roll adapter, snapshot, and chat card consume the resulting components without knowing about the selector. Optional difficulty and its resolved outcome are stored alongside the result; generic numerical modifiers, Help automation, and arbitrary component replacement remain deferred.

The chat card is a historical record, not a live projection of the current Actor.

Foundry integration reads the current registered `core.messageMode` and forwards it unchanged to `Roll.toMessage`. Registration is validated against the extensible `CONFIG.ChatMessage.modes` registry, so this boundary does not impose a closed list of modes. Standard Roll-backed messages provide optional Dice So Nice support without placing module knowledge in the check rules.

## Sheet architecture

The initial Agent sheet is implemented with `HandlebarsApplicationMixin(ActorSheetV2)`. It has two presentation responsibilities:

- edit and display persistent Actor data through the standard `DocumentSheetV2` form lifecycle.
- dispatch attribute, skill, and Aptitude-specialization check intents.

The sheet never calculates check outcomes. It submits pending editable form state, dispatches a typed selection, and leaves Actor reading, composition, Roll execution, result validation, snapshotting, and chat publication to their respective layers. Roll controls are available only to GMs and OWNERs, with authorization repeated at the boundary before any Roll or message is created.

Foundry's `isEditable` remains exclusively the permission boundary for modifying the Actor. A separate, non-persisted `editMode` belongs to each Agent Sheet instance and reveals structural configuration for identity, level, dice, owned Items, and portrait. Normal mode presents those values as information rather than disabled form controls while leaving PV, PD, Ability use, and Ability resource adjustments available to permitted users. The mode starts disabled, survives rerenders of the same instance, and resets when the sheet closes; it does not add a save or cancel transaction beyond the existing `submitOnChange` lifecycle.

The Agent Sheet retains references only to the Profile and Occupation pickers that it opens. Leaving Edit Mode or closing the sheet closes those picker Applications before discarding the references, preventing a structural picker from remaining active after its originating sheet returns to normal mode. The shared picker implementation has no Edit Mode knowledge, and Item sheets opened from a picker's internal edit action remain independent Applications governed by normal Foundry permissions.

Presentation context is assembled by a pure view-model builder. It combines current Actor values with canonical registries, produces form paths and die options, and has no Foundry or DOM runtime dependency. `DocumentSheetV2` owns permissions, form submission, DataModel validation, Document updates, and rerendering.

The Handlebars application uses one coordinated part and reusable identity, Ability, Skills, and die-control partials. This keeps exactly one Skills list in the DOM while allowing its rendered position to change.

### Header

Persistent information:

- portrait;
- name;
- profile;
- occupation;
- level;
- PV;
- PD;
- Physical;
- Mind;
- Emotion.

### Skills panel

Skills are intentionally available independently of the active content tab.

The sheet stores only a local `closed | half` preference. Selecting the Perícias tab derives the `full` state without changing that preference; leaving the tab restores it.

Aptitude expansion is one ephemeral boolean on the sheet instance. A native `details` toggle updates that value so document-driven rerenders preserve the open state. Closing the sheet or refreshing Foundry resets it, and it is never stored in Actor data, flags, or settings.

- **collapsed**: a narrow, clearly labeled `PERÍCIAS` rail remains visible;
- **sidebar**: one-column quick-access list beside current content;
- **expanded**: skills consume the primary content area, normally using two columns.

These states belong only to the sheet instance and reset to Habilidades + closed when the sheet closes.

## Items, Profiles, Occupations, and abilities

Do not create `Item` types simply to make the tree look complete. Profile has a justified identity/catalog boundary, while Ability has independent state, drag/drop, costs, and owned special resources.

An Agent may own at most one embedded `profile` Item. Selection snapshots only `name`, `img`, `type`, and `system.abilityGrants`; the embedded Profile itself stores no source UUID and is not synchronized later. Replacement updates the existing embedded Item in place. A synchronous `preCreateItem` guard blocks simple external attempts to create a duplicate, while malformed pre-existing duplicates are reported rather than silently selected or deleted.

Profile grant orchestration is centralized in the Profile feature coordinator. It preflights all desired non-embedded Ability UUIDs, identifies owned Ability sources from explicit provenance flags and Foundry v14 source statistics, creates missing portable copies, and removes only generated Abilities marked for the current embedded Profile. Creating missing grants precedes deleting obsolete grants so a recoverable partial failure remains safe and idempotently repairable. The picker, Agent-sheet Profile drop, explicit removal, and embedded Profile grant editor all use this boundary.

The Profile Item sheet owns declaration editing and source display, but delegates embedded reconciliation. External Ability drops onto the Agent sheet retain native sorting for already owned Items and stamp a source UUID only when a new portable copy is created.

An Agent may independently own at most one embedded `occupation` Item. Its DataModel is empty, replacement updates the existing Item in place, and removal touches no Abilities. Profile and Occupation share only a type-parameterized visible Item catalog and the generic picker lifecycle; thin domain-specific wrappers provide localization, confirmations, and feature operations. The shared picker imports neither domain.

An Ability may own one optional resource containing only current value and maximum. The Agent Sheet does not aggregate this state; its Ability card exposes a temporary `value/max` summary. The `useAbility` feature validates ownership, permissions, current cost and balance before updating either Agent PD or the owning Ability's `system.resource.value`; expected failures are typed results.

## Compendium build boundary

Reviewed Item sources live under `packs-src/profiles`, `packs-src/abilities`, and `packs-src/occupations`. The build script validates the three hard-coded source/output pairs, removes only their generated destinations, and invokes the official Foundry CLI to compile LevelDB packs under ignored `packs/` directories. `build` and `dev` compile packs before Vite, while release packaging includes the generated directories and verifies all three `CURRENT` files.

The Occupation pack contains only the eight approved names, stable ids, fallback images, and empty system data. It is a reusable selection catalog, not a source of descriptions, grants, bonuses, or automation.

Canonical v14 compendium UUIDs include the document type segment, for example `Compendium.ordemparanormal2.abilities.Item.ability000000008`. Catalog adapters consume the UUID provided by the compendium index instead of constructing it.

Inventory, weapons, and rituals should become Items only after their lifecycle and reuse requirements justify a Document boundary. Occupation now has a justified reusable Item boundary but deliberately no mechanics beyond identity and selection.

Questions to answer before creating an Item type:

- Does it need independent ownership/lifecycle?
- Is it reusable across Actors?
- Does it have effects/actions of its own?
- Does it need drag-and-drop or compendium support?
- Is the playtest structure stable enough to model it?

Until then, prefer the smallest correct representation.

## Foundry API policy

Foundry v14 is the baseline.

The Agent subtype is declared as `documentTypes.Actor.agent`; Profile, Occupation, Ability, and Point of Interest are declared as `documentTypes.Item.profile`, `documentTypes.Item.occupation`, `documentTypes.Item.ability`, and `documentTypes.Item.pointOfInterest`. The Point of Interest declaration additionally carries `htmlFields: ["publicDescription", "gmContext"]` because those `system` paths hold user-supplied HTML edited with ProseMirror. Their DataModels and type-limited sheets are registered during `init` through public configuration and `DocumentSheetConfig.registerSheet` APIs. The system replaces neither `CONFIG.Actor.documentClass` nor `CONFIG.Item.documentClass`.

The Point of Interest ItemSheet is a GM authoring tool. It omits `gmContext` and the information table from the non-GM render context in `_prepareContext` and renders a GM-tool notice instead. This is a **presentation boundary, not secure transport**: POIs remain GM-only-owned in this step, and a client granted access to the Item can still inspect `item.system`. Genuine sanitized distribution to players is the future Investigation Application's responsibility, which must never hand players the raw Item as a substitute for a sanitized projection.

Before implementing a framework-dependent feature:

- verify the current v14 API;
- prefer public APIs;
- isolate unavoidable private API usage;
- do not copy old patterns from v13 solely because another system uses them.

Compatibility shims must have a concrete need and an expiration rationale.

## Error handling

Core/domain functions should fail with typed or explicit invalid states rather than user notifications.

Presentation/integration layers own user-visible error reporting.

Do not swallow failures that can corrupt resource state or produce misleading chat history.

## Testing boundaries

Tests enforce both behavior and architecture at the level justified by the current codebase.

Examples:

- die-step membership and the canonical skill registry are pure unit tests;
- check outcome resolution is a pure unit test;
- serialization of a chat snapshot is an integration/boundary test;
- Node execution of core tests verifies that core has no runtime Foundry dependency;
- manual Foundry tests validate registration, Documents, sheets, permissions, chat behavior, and resize states.

## Change strategy during the playtest

The playtest is expected to change.

Therefore:

- prefer small releases;
- isolate rules from Foundry presentation;
- avoid encoding provisional rules in schema names when a generic stable concept exists;
- document confirmed assumptions;
- explicitly list deferred/unknown mechanics;
- remove obsolete code instead of maintaining compatibility with unreleased internal designs.

The architecture should optimize for **safe change**, not speculative feature count.
