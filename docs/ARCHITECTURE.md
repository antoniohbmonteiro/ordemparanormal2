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

An Ability may own one optional resource containing only current value and maximum, plus an ordered collection of use forms. Each form has a stable ID, rich-text description, structured cost, optional minimum Agent level, and an optional typed PRE-ROLL Check integration. The first integration variant adds one normal die and scopes applicability to any Check, an effective attribute, or one canonical non-Aptitude Skill. The Agent Sheet does not aggregate the resource; its Ability card exposes a temporary `value/max` summary and only directly actionable forms. The `useAbility` feature excludes PRE-ROLL forms and validates ownership, permissions, level, current cost and balance for independent forms.

The Check Dialog receives a plain projection of the Agent's embedded Abilities and resolves applicable forms without traversing Foundry Documents. Its local reducer reconciles alternate attributes, one form per Ability, the shared four-die cap, and aggregate pending costs. After the dialog, the feature re-reads the Actor, prepares authoritative extra dice, evaluates the Roll, then revalidates and consumes the complete cost plan inside a per-Actor queue before publication. Actor PV/PD changes are grouped separately from embedded Ability-resource changes; Foundry provides no transaction across those Documents and ChatMessage publication is intentionally not rolled back.

Ability-use editors keep only their own field drafts. Save, removal, and reorder operations share a per-Ability client queue, re-read the current `system.uses`, resolve by stable ID, apply only the requested mutation, and issue one Item update. This prevents a second local editor from restoring a stale array while preserving ordinary last-save-wins behavior when both editors change the same field.

Current Check snapshots are V4. They retain V3's resolved extra dice and add immutable applied-Ability provenance and confirmed costs. V1 through V3 remain readable; resolved Check Requests and Opposed Check sides may therefore contain V3 or V4, while every new client submission must be V4.

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

The Agent subtype is declared as `documentTypes.Actor.agent`; Profile, Occupation, Ability, and Point of Interest are declared as `documentTypes.Item.profile`, `documentTypes.Item.occupation`, `documentTypes.Item.ability`, and `documentTypes.Item.pointOfInterest`. Ability declares `htmlFields: ["description", "uses.description"]`, while Point of Interest declares `htmlFields: ["publicDescription", "gmContext"]`, because those `system` paths hold user-supplied HTML edited with ProseMirror. Their DataModels and type-limited sheets are registered during `init` through public configuration and `DocumentSheetConfig.registerSheet` APIs. The system replaces neither `CONFIG.Actor.documentClass` nor `CONFIG.Item.documentClass`.

The Point of Interest ItemSheet is a GM authoring tool. It omits `gmContext` and the information cards from the non-GM render context in `_prepareContext` and renders a GM-tool notice instead. This is a **presentation boundary, not secure transport**: a client granted access to the Item can still inspect `item.system`. World POIs used by Investigation must remain GM-controlled. The active-GM Investigation and Scene queries deliver sanitized player projections, never the raw Item. The World Item is the concrete campaign entity; a compendium or preset is only a source/template.

Investigation v2 keeps the Foundry Scene run in a narrow Scene flag adapter and resolves participant World Agents from linked Scene Tokens. Pure runtime transitions and permanent-information matching live in `core/investigation`; GM-authoritative queries coordinate POI knowledge/provenance, private JournalEntry clues, Checks, PD, and chat requests in the Foundry POI adapters. The POI Item still owns persistent knowledge by Agent UUID and information ID. The private JournalEntry is exposed only through sanitized active-GM queries. ApplicationV2 windows render projections and send intents; they do not decide access or reveal rules. Examinar binds a confirmed Check Message before serialized passive and Check resolution, then marks the Agent acted, with idempotent retry. Recap and Share reuse Check Requests and the existing chat card shell; Share uses one private card. Visual reuse stays within Investigation's scoped CSS for simple buttons, badges and headers; window layouts remain specific. The small Investigation d6 button SVG is the approved Figma asset, while Check Dialog die glyph CSS remains local to its actual consumer.

Before implementing a framework-dependent feature:

- verify the current v14 API;
- prefer public APIs;
- isolate unavoidable private API usage;
- do not copy old patterns from v13 solely because another system uses them.

Compatibility shims must have a concrete need and an expiration rationale.

## Error handling

### Adventure Agent preset import

`AdventureDefinition.actors` contains only unique legacy `{presetId}` references. Ten schema-version-2 JSON mechanical presets have stable opaque keys, statistics and canonical Item UUIDs, with no character or Item names. `src/config/adventure-agent-sources/playtest-alpha.ts` binds each key to its legacy document ID, Act, portrait asset and Token asset. The mechanical revision is 2 and is independent from the schema version. The pure validator uses the caller's skill registry and rejects incomplete statistics and unknown properties. PDF v1.0/v1.1 recognition and successful reading remain required, using the shared lazy PDF.js loader. Neither PDF nor ZIP images supply mechanical data at runtime.

The single world-import action prepares all selected POIs from the recognized PDF before materialization, then materializes assets, imports handouts and POIs, prepares all selected Actors, obtains at most one Actor conflict decision, and writes Actors sequentially. Scope comes exclusively from the current `materializedActs` (five Agents per Act). The ZIP preflight binds each portrait and Token reference to a unique real entry in the same package and verifies matching character names before any upload. A new Actor's name comes from the matched portrait entry path; reimport preserves later renames. Canonical references use exact system-compendium UUIDs supplied by the shared Item catalog, then the existing portable snapshots. Profile grant preparation/application reuse the Profile feature boundary with pre-resolved sources.

Source recognition separates PDF edition from document variant. The measured v1.1 Survivors distribution covers Ato I; the Agents documents cover both Acts. Binary PDF hashes are the fast path, and full normalized text identifies a repackaged PDF only after PDF.js successfully parses its page count and version stamp. ZIP hashes retain the measured legacy fast path after raw-entry safety checks. On a miss, the canonical structural manifest must match every required file by path, size and CRC, plus three measured anchors; the fallback then confirms SHA-256 of the uncompressed bytes. Only three measured Ato II EMF audio files may be absent as supplements. Missing supplements require explicit acknowledgement and never become stored assets; changed supplements, missing required files and unexpected payloads block import. Act compatibility and selection are decided by the feature before materialization, then revalidated for all selected Acts before world writes. Imported Actor flags retain the existing `edition` field without a migration.

The Adventure Importer owns one shared typed-folder policy for Actor, JournalEntry and Scene Documents. Each Document type receives its own `A Maldição do Ídolo de Pedra > Ato I/Ato II` tree. Folder identity comes from `flags.ordemparanormal2.adventureImport`, never names; valid legacy Actor/Handout folder provenance is upgraded in place. The importer reconciles managed Folder names, colors and provenance while preserving IDs and all contents. Scope comes only from this run's materialized Acts, and structural conflicts across all required trees block the document pipeline before its first write.

New imported Documents start in the corresponding Act Folder. `flags.ordemparanormal2.adventureImportFolder` records that one-time placement has been handled; later user moves are preserved and `folder` stays outside managed baselines. Existing Actors/Journals retain their position while receiving that marker after legacy Folder reconciliation. The revision-one basement Scene may be moved from no Folder into the Scene Act I tree once, including when its managed configuration is preserved.

Abilities in a preset are the complete desired set. Effective Profile grants must be included. Heitor's explicit preset replacement changes only his embedded Executor snapshot from base Ímpeto to Ímpeto (Aprimorado); canonical Executor and normal consumers remain unchanged. Manual Abilities of the exact UUID satisfy references without adoption. New grant Items receive `profileGrant` provenance at creation; other imported Items receive `adventureImport` provenance at creation.

Actor identity is importer/adventure/legacy document ID, never name or opaque mechanical key. `flags.ordemparanormal2.adventureImport` stores contract version, preset revision, edition, Act, asset IDs and incomplete/complete status. Existing World flags and Scene Token references retain the legacy IDs without migration. Completed baselines contain SHA-256 digests of persisted managed projections and embedded Item inventories, plus manually satisfied UUIDs without their payload. Divergence compares current source against the last applied baseline, independently of source updates. Actor names, current resources, accent, folder/ownership/sort, other token configuration, manual Items, effects and unrelated flags remain preserved. Only managed fields and importer-owned obsolete Abilities reconcile.

All predictable validation, canonical/model checks, provenance conflicts and divergence detection precede Actor-stage Folder/Actor/Item writes. Structural conflicts block the batch. The single dialog can preserve entire divergent Actors, restore managed data, or cancel before writes. Execution guards concurrency, active-GM authorization and relevant preflight state. Each Actor is marked incomplete before changes; complete and baseline are persisted only after confirmed operations. Operational failure stops immediately, retains previous results without destructive rollback, and recovers on rerun through identity and the same conflict dialog.

### Adventure POI source preparation

`src/config/adventure-poi-sources/playtest-alpha.ts` is the permanent technical catalog for 54 POIs. It contains section anchors, edition-specific structural mappings, image asset IDs and stable persisted information IDs, without narrative content. PDF bytes pass through the shared PDF.js adapter into page text items; the Playtest Alpha parser selected by recognized edition builds an in-memory POI preparation separate from `PdfSourceAnalysis`. All selected Acts must parse and validate against the catalog before asset materialization or any World write. Ambiguous headings, malformed tables, unknown skills, DTs or information bindings abort preparation. Agentes v1.0/v1.1 cover both Acts; Sobreviventes v1.1 covers only Act I. OCR is not used.

Unconditional introductory description becomes `publicDescription`; ordinary `Perícia / DT / Informação` rows become `information[]`. A row with alternative skills keeps one information ID and multiple approaches. Aptidão uses canonical specializations. Ordinary rows are `always` information bound in table order to `informationIds`. Rows with an explicit prerequisite, a character qualifier or a section-level condition become `situational` information whose textual condition keeps the printed prerequisite wording (section condition first, then the row qualifier); a cell printed with player-count icons becomes one situational information per group size. Each situational row is bound to its canonical ID only by an explicit `situationalInformation` `{row, variant?, id}` entry in the catalog; an unbound row, an unused binding or an unseparable prerequisite aborts preparation. Catalog `contextRowIndexes` rows, contextual narrative, challenges and unbound tool instructions remain neutral `gmContext` and never become information. POI revision 4 adds situational information while preserving existing World Item identities, released information IDs, provenance and reconciliation behavior; the managed digest omits the default `always` availability, so revision 3 baselines stay valid. Revision 5 reads a DT cell printed as "N ou M" as base DT N with one approach `difficultyOverride` of M. Its condition joins the conditional clause of the access action whose GM sentence moves that skill's DT "de N para M" with the rest of that sentence, and the sentence leaves `gmContext`; a missing or ambiguous rule aborts preparation. The override has no initial value, so approaches stored without it keep their digest.

### Adventure Act II tool population

POI revision 6 adds curated tools only to Act II of the Agentes v1.1 PDF. `src/config/adventure-poi-sources/playtest-alpha-act-two-tools.ts` holds 32 canonical Equipment/form bindings across 12 POIs, explicit stable IDs, original short summaries and narrative conditions. These produce 34 additional Informations (29 always, 5 situational), appended in tool-table order after existing skill Informations. The parser exposes the already-paired tool rows and their source locations before HTML rendering; it does not parse `gmContext` back into data. Missing/ambiguous bound rows or incompatible lengths/puzzles stop preparation before writes. Laboratory lengths are 4/5/6 as printed. Radio fragments come only from the supplied PDF, using reviewed structural indices/counts and solution validation; the Altar's exact `SEU FILHO,` typo becomes `SUA FILHA,`. No complete official puzzle list is distributed in the catalog. Mapped long explanations leave `gmContext`; short GM guidance and manual media references remain. Act I, Agentes v1.0 and Sobreviventes parsing retain their existing behavior.

The Wardrobe Laboratory has no printed length, and the Idol Radio has no orderable puzzle; their short responses remain manual `gmContext`, without a ToolApproach. Conditional Camera/Perception and Powder/Occultism skill clues stay situational. UV responses bind only `ultraviolet-burst`, not illumination. Normal readings, Laser, media delivery and combined Tool/Skill mechanics are outside the population. The strict preset validator accepts the existing skill/tool union and typed mechanic branches, rejects extra fields and conflicting configuration for one pair, and leaves managed digest/reconciliation rules intact. Revision 5→6 updates untouched World POIs in place; preserve/restore decisions retain their meaning, with runtime flags, Knowledge, Discovery and associations outside managed writes. Manual validation is pending in [ACT_TWO_TOOLS_MANUAL_CHECKLIST.md](ACT_TWO_TOOLS_MANUAL_CHECKLIST.md).

### Adventure Scene preset import

The same world-import action continues from Actors to Scenes. `AdventureDefinition.scenes` holds the explicit `actOne.basement` and `actTwo.basement` preset references. Eligibility comes exclusively from this run's materialization scope. A complete preserved Actor can satisfy a semantic Token binding; Actor cancellation stops the pipeline.

The reviewed schema-version-1 JSON presets contain only managed configuration rather than raw Scene exports. The Act I basement revision 2 contains one native v14 Level, 168 Walls, three interactive control Tiles, one optional opened-bookshelf Tile, five linked Agent placements and three control-label Drawings. Its control icon resolves to the system-owned `assets/scene-controls/gm-control-button.png`. The bookshelf Tile references a semantic crop recipe, not artwork in the system package. The Act II basement remains revision 1 with one Level, 145 Walls, two regular doors and five linked Agent placements, with no Tiles or Drawings. Each map and Token image resolves through semantic adventure assets from the current materialization.

Immediately before Scene preparation, the importer checks for the optional generated bookshelf PNG under the Act I World asset root. A valid 200×440 file is reused. If absent and the current run materialized both Acts, browser image APIs crop the materialized Act II map at (2486,1815) and the Foundry FilePicker adapter uploads and confirms the PNG. Act I alone works without the overlay; Act II alone never requests it. A failed crop/upload leaves Act I mechanically importable without the Tile. If the file lookup is indeterminate, an already imported Act I Scene is skipped to avoid removing a possibly valid overlay. The full preset is validated before an effective preset omits unavailable derived Tiles and their controller references. The original ZIP asset resolver remains strictly scoped to this run's materialized Acts.

Scene identity uses importer/adventure/document provenance, never a name. Embedded provenance specifies the Scene identity, Document type and stable embedded ID. Reviewed export IDs remain stable within the preset, including `defaultLevel0000`; the authoring Scene and Actor IDs are discarded. Initial creation retains embedded IDs; reconcile uses public v14 batch writes with IDs known beforehand. Manual collisions and incompatible provenance block preflight rather than adopting documents.

Pure core code validates configuration and relationships, projects managed data, computes persisted baselines and plans embedded changes. Feature code resolves assets/Actors, detects divergence and coordinates execution. The Foundry adapter owns file availability checks, `Actor.getTokenDocument`, native model validation and persistence. Installed declaration gaps for v14 Scene fields/Levels are isolated behind a narrow adapter interface. Native validation also rejects unexpected cleaning of managed fields before any Scene-stage write.

Managed Scene data includes dimensions, offsets, grid, vision, fog configuration and environment; the Level owns the map presentation. Walls, Tiles, Tokens and Drawings manage explicit configuration only. Scene/Token/Level names after creation, ownership, navigation, viewport, links, weather, fog exploration/reset and unrelated flags remain preserved. Folder placement is initialized once by the shared Adventure folder policy and then remains user-owned. Door state, Tile visibility/lock, Token position/elevation/current Level/rotation/visibility/lock, and Drawing visibility/lock are initialized on creation and preserved even during restore. Actor linkage and Token texture/configuration remain managed. Only provenance-owned obsolete embedded documents may be removed; known manual interaction/Level dependencies block removals that would invalidate them. Manual collections are never replaced or emptied.

All selected Scene presets, scope, assets, complete Actor bindings, native models, identities, relationships, removal dependencies and divergence are prepared before the first Scene-stage write. One Scene/lote dialog can preserve entire divergent Scenes, restore managed configuration or cancel. Revision updates are distinct from manual divergence; older presets do not downgrade newer imported Scenes. Execution rechecks active-GM authorization, bindings and relevant Scene state. Scenes remain incomplete until persisted managed data and references are confirmed, then receive a persisted baseline. Failures retain previous pipeline results without destructive rollback and recover by identity on rerun. Regions/POIs, playlists and a generic interaction/sync engine remain outside this feature.

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

## Equipment usage and Investigation tools

Pure `core/equipment/equipment-use-plan` validates the current form and plans a one-use payment; `core/investigation/resolve-information` separately matches source/form pairs against new always information. Neither depends on Documents, markup, chat or private POI access. The authored POI union and guards retain the existing skill representation and isolate tools from DT calculations.

`features/equipment/use-equipment` owns shared selection, client busy state, authority routing and same-operation retries. `applications/equipment/equipment-use-dialog` only selects a form. Inventory and Investigation send distinct intents; only Investigation supplies contextual binding. `adapters/foundry/equipment` owns native provenance, authorization, serialization, payment and session receipts. Manual uses adjustments enter the same authoritative queue. The Equipment publisher remains presentation-only.

`adapters/foundry/points-of-interest/use-poi-tool` routes standard use or laboratory/radio preparation. Its extracted `poi-tool-context` boundary owns contextual authorization and existing Knowledge/Discovery writes under the POI queue. It never calls Examinar, changes PD or marks round participation. Generic execution accepts an opaque binding and post-use callback without interpreting Investigation state. Narrow server-owned options validate an expected mechanic and preparation before payment. Partial results distinguish analysis, publication and discovery failures, with resumable stages; there is no cross-Document transaction, custom socket or persisted journal.

Player projections whitelist inventory and known content, never ToolApproaches or private provenance. Investigation derives tools from the resolved owned Agent, subscribes to Item changes and client busy state, and releases listeners on close. Authoring alone loads the reusable tool catalog. Scene sharing retains current references and provenance, with neutral grouping when no SkillApproach exists.

Manual Foundry validation is pending for the user: [INVESTIGATION_TOOLS_MANUAL_CHECKLIST.md](INVESTIGATION_TOOLS_MANUAL_CHECKLIST.md). Automated tests may load the installed v14 common module without launching Foundry.

Special preparation distinguishes a missing canonical source/form binding from invalid authored data. After authorization and strict source validation, a new unbound laboratory/radio use returns a server-only absence outcome to `use-poi-tool`. The dispatcher invokes the shared executor outside the preparation queue and revalidates absence with its existing `beforePayment` option. It publishes only the normal Equipment card and returns `{newCount: 0, manual: true}`, without special sessions, Rolls, Checks, removal notices, conclusions or Knowledge/Discovery writes. Payment remains the form's existing `consumesUse` rule. In-memory route receipts preserve the manual path across retries and later POI edits; an existing session never becomes fallback. Present but missing, malformed, incompatible or conflicting mechanic configuration remains an authoring error. Inventory context and active-GM requirements stay intact.

Investigation keeps its existing status/refresh and selects positive discovery counts first, manual contextual feedback for zero plus `manual: true`, and the zero-discovery message only for zero plus `manual: false`. The manual branch reuses `equipmentUseFeedback` and the existing Equipment translation. Errors, cancellation and partial failures retain their current distinction.

### Laboratory use forms

The use-form parser normalizes absent `mechanic` to `standard`; the Equipment DataModel has the same default. A ToolApproach can contain a typed laboratory length (4, 5 or 6), without changing its source/form identity. Native validation rejects conflicting lengths for one pair within a POI. Authoring exposes each form's mechanic, reuses an existing pair's length, and confirms one shared reconfiguration before an atomic Information-array write. Invalid references remain stored. Only the portable laboratory source's existing `analyze` form opts in; existing copies are not recognized by name or migrated.

`core/equipment/laboratory-challenge` owns the normal die ladder, ceiling, nondecreasing sequence, selection validation and per-position reroll cost. This is separate from Checks, criticals, DTs, totals and the four-dice Check limit. `adapters/foundry/dice/execute-laboratory-roll` evaluates and serializes one public non-interactive Roll for each position.

`adapters/foundry/equipment/laboratory-session` holds active-GM sessions and command receipts in memory. Preparing binds authenticated requester, operation, Equipment, source/form, Scene/POI/run, length and initial target IDs without side effects. Starting captures Mente and Exatas in the existing executor's prepayment validation, executes payment/publication, and evaluates the sequence. One active session per Equipment is enforced through the same queue as ordinary use and manual resource edits; no queue is held during human interaction. Revisioned command receipts retain completed Rolls after a partial batch and prevent duplicate payment, rolling or grants. Cancellation before start is free; after start it preserves executed consumption and records a cancelled analysis. Grant receipts preserve original counts across a committed update whose response was lost. Success uses the existing joint Knowledge/Discovery write for only the frozen, still-compatible always targets. Configuration and ownership changes invalidate an unfinished analysis.

`features/equipment/laboratory-session` routes queries to the captured authority, keeps command IDs on timeout, restores pending commands from the session, and coordinates cancellation and terminal results. The Laboratory Application has only presentation state, selection and focus. Investigation retains its existing discovery status and refreshes projections after the terminal result; parent close, Agent and context changes cancel unfinished sessions. Inventory cannot execute a laboratory form without Investigation, and laboratory execution requires an active GM. Standard no-GM fallback is unchanged.

A started analysis produces one private result card for GM/OWNERS, with a versioned immutable snapshot, every completed native Roll, partial reroll history and terminal outcome. The snapshot has no configured source, private Information IDs or unknown content and is not used to recover a lost authority session. Restart or authority replacement requires manual reconciliation. The user confirmed Laboratory manual validation; [LABORATORY_MANUAL_CHECKLIST.md](LABORATORY_MANUAL_CHECKLIST.md) remains the regression checklist.

### Radio use forms

`core/equipment/radio-puzzle` owns configuration validation, exact Technology removal bands, sampling without replacement, injected Fisher–Yates shuffle and deterministic piece transitions/success. Configuration branches are explicitly copied and signed in the POI data module; Radio and Laboratory remain distinct mechanics. The reusable catalog carries the current form mechanic. The GM edits local ordered message pieces and false pieces in `applications/item/radio-puzzle-config-dialog`; the existing approach workflow confirms shared edits and checks the previous signature before one POI write. Invalid references are retained.

The normal `features/checks/resolve-agent-check-interaction` composes dialogue preparation and current-Actor execution preparation. Radio uses these narrow stages to accept only typed choices, fixing Technology without DT. `adapters/foundry/equipment/radio-session` rebuilds the current Check on the GM, derives Ability dice from references, invokes the existing `executeFoundryCheck` and cost confirmation, and retains completed stages. No new dice adapter or Check rules are introduced. `adapters/foundry/chat/publish-radio-result` creates the normal immutable Check snapshot with the requester's registered message mode; native self mode is addressed to the requester instead of the executing GM. A short immediate removal notice and the separate Radio conclusion go to GM/OWNERS without a Check result or private solution. The notice receives only the resolved session count; its publication checkpoint and operation flag prevent duplicates on retry/resume, including a committed message whose response was lost. The current inline window feedback is unchanged.

Radio authority uses authenticated public queries and the existing Equipment executor/queue. Preparation binds requester, authority, operation, source/form, context, configuration and eligible IDs. One active reservation per Equipment is enforced by explicit composition of Laboratory and Radio guards at bootstrap, without a generic challenge manager. Start pays/publishes once and then resolves the Check and initial puzzle. Revisioned command receipts deduplicate move/discard/restore/finish/cancel and retain pending commands for reconnects. Shuffle, tokens and removals are materialized only once. Knowledge uses the existing serialized contextual writer and a frozen target list. Ambiguous evaluation/payment cannot be automatically retried; partial publication or grant can complete confirmed stages using the original command.

`application/equipment/radio-session` defines safe public DTOs and commands, and `radio-snapshot` defines versioned conclusion history. `features/equipment/radio-session` owns Check dialogue, authority routing, timeout IDs, parent cancellation and terminal delivery; `features/points-of-interest/use-investigation-tool` locates an existing session before preparing another. `RadioApplication` only presents the four approved states, local focus/loading/error and intents, with native ApplicationV2 controls. Investigation keeps its existing feedback and projections. Public state, resumed commands and conclusion snapshots exclude Check totals, outcomes, dice and snapshots, including blind rolls. History never reconstructs lost sessions. Manual Radio validation is **PENDENTE**: [RADIO_MANUAL_CHECKLIST.md](RADIO_MANUAL_CHECKLIST.md).

## Stateful Opposed Checks

A stateful Opposed Check owns exactly one ChatMessage. Its versioned `flags.ordemparanormal2.opposedCheck` value is persistent truth; the stored content is a shared, control-free fallback. `OrdemParanormal2ChatMessage` delegates per-client button projection and DOM listeners to `ui/chat`, while creation, rolling and authoritative submission remain separate feature use cases. Foundry UUID/User resolution and Query registration remain adapters.

The active GM is the only writer. Other clients call the public User Query API, whose Foundry 14.367 receiving signature is `(data, {timeout, user})`; the handler resolves that authenticated `user` back through `game.users` before checking Actor ownership. A transient queue per message serializes local and queried submissions. No system socket is registered.

Rolls that update an existing card use an optional Foundry adapter to call Dice So Nice's public `showForRoll` API on the originating client. The adapter requests Dice So Nice's native cross-client synchronization and awaits local animation completion before the feature creates and submits the snapshot. If the originating document is already hidden or becomes hidden while waiting, the adapter stops awaiting without canceling the animation, so a background renderer cannot indefinitely block the resolved Check. Missing, inactive or failed presentation never changes or discards the result. Normal Checks continue through `Roll.toMessage` and do not call this adapter.

Shared Foundry Handlebars partials are loaded by the neutral `adapters/foundry/templates` boundary. Neither the Opposed Check Dialog nor other applications depend on a chat-specific adapter merely to render a shared portrait.
