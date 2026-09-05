# Roadmap

## Guiding principle

Build the smallest version that is structurally correct and useful, then expand only when the public playtest gives us enough information.

Early development uses internal `0.0.x` milestones intentionally. A milestone present on `main` is not necessarily a published release; the project should become playable before it becomes heavily automated.

## 0.0.1 — Placeholder ✅

Purpose: establish the public package and stable system identifier.

Delivered:

- system ID `ordemparanormal2`;
- Foundry VTT v14 compatibility declaration;
- minimal ES Module initialization;
- repository, manifest, and release baseline;
- unofficial-project disclaimer;
- no game content or automation.

## Internal milestone 0.0.2 — Architecture foundation ✅ on `main`

Purpose: define how the system will be built before introducing persistent game data.

Scope present on the development branch:

- `AGENTS.md` with coding and architecture rules;
- architecture documentation;
- current domain-model documentation;
- roadmap with small reversible milestones;
- public title simplified to `Ordem Paranormal 2`;
- internal milestone documented as `0.0.2` without changing the public manifest version;
- README updated to reflect the architecture phase.

Explicitly not included:

- Actor Data Models;
- Actor sheets;
- Items;
- rolls;
- chat cards;
- threats;
- combat automation;
- investigation automation;
- TypeScript/Vite runtime migration.

Reason: architecture should be agreed before the first persistent schema ships.

## Internal milestone 0.0.3 — Runtime scaffold + Agent Data Model ✅ on `main`

Purpose: introduce the real TypeScript build and the first persistent character schema.

Implemented and manually validated in Foundry v14:

- TypeScript strict mode;
- Vite build;
- ES Module output in `dist/`;
- Foundry v14 typing strategy;
- `agent` Actor type only;
- Agent Data Model;
- centralized die-step domain;
- centralized skill registry;
- PV and PD as universal Agent resources;
- Physical, Mind, Emotion;
- occupation and level;
- unit tests for framework-independent domain utilities;
- architecture boundary tests where practical.

Acceptance target:

> A blank Agent can be created and persisted with valid typed data without a custom production sheet yet.

This acceptance target was completed by the manual Foundry v14 smoke test.

Resource criteria for that smoke test:

- `value > max` is accepted and persisted for PV and PD;
- `value < 0` is normalized to zero and persisted for PV and PD;
- `max < 0` is normalized to zero and persisted for PV and PD.

The Node test suite verifies the resource field configuration (`integer: true`, `min: 0`, no upper bound) and the absence of joint resource validation. The cleanup and persistence behavior above belongs to the Foundry runtime and remains covered by the manual Foundry v14 smoke test rather than a local field mock.

## Internal milestone 0.0.4 — First functional Agent Sheet ✅ on `main`

Purpose: make Agent data pleasant to edit in Foundry without introducing check automation yet.

Implemented and manually validated in Foundry v14:

- first custom Agent sheet;
- VTT-first header;
- portrait, name, occupation, level, and the selected embedded Profile;
- fixed PV/PD controls;
- Physical, Mind, Emotion controls;
- registry-driven skills presentation;
- independently editable Aptitude specializations;
- one-column skills sidebar without speculative state management;
- compact native die selectors with full grade labels in the picker;
- responsive behavior for narrow sheet widths;
- basic accessibility and keyboard-friendly controls.

Visual goal:

Clean and intentional, but not final art direction.

Acceptance target:

> An Agent can edit and persist every field currently represented by `AgentDataModel` through the system sheet.

The future collapsed and expanded skills-panel states remain presentation options, but are not part of this milestone.

## Public milestone 0.0.5 — Simple checks + chat ✅

Purpose: deliver the first installable playtest release with a small, structurally sound check foundation.

Delivered and manually validated in Foundry v14:

- domain check contracts;
- current-Actor-value resolution at roll time;
- Foundry Roll adapter;
- individual dice and total;
- attribute, skill, and Aptitude-specialization actions from the Agent sheet;
- chat card with immutable resolved snapshot;
- explicit support for Foundry's current registered chat message mode;
- GM/OWNER authorization with read-only controls for other users;
- natural optional Dice So Nice support through the standard Roll message flow;
- unit tests for rule resolution.

Explicitly deferred:

- difficulty and success/failure;
- critical success/failure;
- RA/RB;
- modifiers, extra dice, Help, or attribute replacement;
- dialogs and roll-again actions.

Acceptance target:

> A player can use the Foundry sheet as the character sheet and dice interface for normal playtest checks.

The approved smoke test covered attributes, skills, Aptitude, chat history, registered roll modes, GM/OWNER authorization, read-only sheets, and Dice So Nice present or absent. Release packaging and publication are owned exclusively by the tag-triggered GitHub Actions workflow.

## Public milestone 0.0.6 — Check Dialog + optional DT ✅

Purpose: reduce check friction without replacing the simple-check engine or expanding into broader automation.

Delivered:

- a Foundry v14 `DialogV2` prompt before every current Agent check action;
- resolved check name, components, and current dice shown before rolling;
- optional positive-integer DT with pure success/failure resolution;
- immutable `CheckSnapshotV2` history, while retaining V1 reading compatibility;
- DT and a simple colored success/failure result on applicable chat cards;
- derived RA/RB and critical-state presentation from immutable individual die results;
- linked prototype tokens by default for newly created Agents, preserving explicit values without migrating existing Actors.

Explicitly deferred:

- modifiers, extra dice, alternate attributes, Help, or quick-roll shortcuts;
- roll-again actions and GM check requests;
- expanded automated boundary coverage and full release documentation, which have dedicated follow-up passes.

## Public milestone 0.0.7 — Profile + Ability Items and contextual sheet ✅

Purpose: give Profiles and Abilities real Foundry Document lifecycles, keep special resources on their owning Ability, and make the Agent Sheet adapt to play context.

Delivered:

- `profile` Item type with an identity-only, empty `ProfileDataModel`;
- minimal Profile Item sheet for world and embedded Items;
- exactly one embedded Profile per Agent, with synchronous duplicate protection;
- picker spanning visible world Items and visible Item compendia;
- replacement in place, explicit removal, and Profile drag-and-drop;
- portable Profile snapshots containing only name, image, type, and empty system data;
- `ability` Item type with description, structured cost, and one optional owned resource;
- automatic Ability cost consumption from PD or the resource on the same Ability;
- fixed Agent resources reduced to PV and PD;
- closed, half-open, and full Perícias states held only by the sheet instance;
- Habilidades tab with sortable embedded cards and use/edit actions;
- no migration or compatibility handling for the removed development fields.

Acceptance target:

> A user can select a reusable Profile, manage embedded Abilities, use their costs, edit their owned special resources, and switch Perícias between contextual layouts without making Item state universal Actor data.

Development Actors with the removed `system.profile` or `system.resources.impetus` fields may be recreated or reconfigured manually.

## Public milestone 0.0.8 — Profile Ability grants + core compendiums ✅

Purpose: connect the existing Profile and Ability lifecycles without guessing Ability mechanics or origins that the playtest does not establish.

Delivered:

- ordered Profile declarations containing only non-embedded Ability source UUIDs;
- preflight validation and idempotent reconciliation across Profile selection, replacement, removal, drop, and embedded grant editing;
- provenance flags that distinguish Profile-generated Abilities from manual or unrelated embedded Abilities;
- preservation of manual same-source Abilities, owned edits, resource state, and shared grants;
- a Profile-sheet grant editor using the Foundry v14 document-drop boundary;
- system-owned `Perfis` and `Habilidades` Item compendiums generated from reviewed JSON sources;
- Executor, Analista, and Vigilante, with only their three strongly supported Ability relationships;
- the exact sixteen observed Ability names as empty, free placeholders without resources;
- reproducible official-CLI pack compilation and release-archive checks.

Explicitly deferred:

- Occupation Items;
- origins or Profile grants for the other thirteen Abilities;
- official descriptions, mechanics, effects, or artwork;
- an invented Ímpeto resource or any Agent-sheet redesign;
- migration or name-based adoption of existing development Items.

Acceptance target:

> A user can select, replace, edit, or remove one of the core Profiles and receive only its declared Ability while all manual and unrelated Abilities remain untouched.

## Public milestone 0.0.10 — Community License compliance + playability polish ✅

Purpose: package the current usability improvements with explicit Community License compliance and a release-ready distribution boundary.

Delivered:

- official Community License seals preserved as supplied and included in the release archive;
- a versioned, client-scoped notice presented after the Foundry `ready` hook;
- the required non-official and artificial-intelligence notices in Foundry and the README;
- separation between the Community License terms and the MIT license for original code, which was the code license in effect for 0.0.10;
- per-component Check Dialog step adjustments, Ability-owned resource simplification, and the current Agent Sheet layout polish;
- release packaging validation for the seals and Community License summary.

Licensing transition: development-branch source code is available under PolyForm Strict License 1.0.0 starting with the LICENSE migration. Public releases through v0.0.22 were distributed under MIT, which continues to apply to copies already distributed. Version 0.1.0 will be the first public release distributed under PolyForm Strict.

Acceptance target:

> Every client sees the current compliance notice until explicitly accepting that version, and the tag-built archive contains the complete compliance documentation and unchanged official seals.

## Public milestone 0.0.12 — Extra Dice + Check Dialog ✅

Purpose: add real situational dice to the existing Check foundation and give
the dialog enough room to configure them without introducing Ability
automation.

Delivered:

- transient, individually identified situational `d4` through `d12` dice;
- a domain-enforced maximum of four total rolled dice;
- three-highest total calculation when four dice are rolled;
- all rolled results retained for RA, RB, and critical analysis;
- immutable `CheckSnapshotV3` history with V1/V2 compatibility;
- a reorganized, compact Check Dialog with removable repeated dice and the
  supplied transparent dice glyphs;
- individual CC BY 3.0 attribution for the five Game-icons.net dice glyphs.

A later public explanation confirmed that the three highest results are summed
when four dice are rolled. The existing implementation already follows that
rule.

Explicitly deferred:

- Ability-driven extra dice or automatic costs;
- Help, opposed checks, rerolls, and generic modifiers.

## Public milestone 0.0.13 — Alternate Attribute Checks ✅

Purpose: let the table choose a different current Agent attribute for one skill
or Aptitude-specialization Check without changing its registered default.

Delivered:

- a compact Físico/Mente/Emoção selector in the existing attribute row;
- the registered `baseAttribute` as the initial selection;
- transient use of the selected attribute's current die;
- preservation of the attribute slot's step adjustment across selection changes;
- unchanged skill dice, extra dice, four-die limit, Roll execution, and chat layout;
- historical truth through the effective components already stored by
  `CheckSnapshotV3`, with V1/V2 compatibility and no Actor migration.

Explicitly deferred:

- persisted attribute preferences;
- generic component replacement or modifier engines;
- Chat Card redesign.

## Current internal milestone — Occupation Item lifecycle

Purpose: replace the released free-text Occupation with a reusable, minimal Item boundary without inventing rules.

Implementation target:

- empty `OccupationDataModel` using native Item name and image;
- at most one embedded Occupation per Agent;
- shared visible world/compendium picker infrastructure with specific Profile and Occupation wrappers;
- selection, replacement, removal, editing, and Agent-sheet drag-and-drop;
- versioned, idempotent conversion of legacy strings to local embedded Items;
- system-owned `occupations` compendium containing the eight approved names with empty system data;
- no Ability grants, provenance, bonuses, descriptions, or other official content.

## Current internal milestone — Narrative Scene lifecycle

Purpose: represent the GM-declared narrative scene without coupling rule state to a Foundry Scene, Canvas, or Combat.

Implementation target:

- one world-persisted active scene containing only a generated ID and name;
- GM-only start and end management through a dedicated **Narrativa** tab in the right sidebar;
- a shared, strictly informational HUD showing the active name to every client;
- explicit end using the expected active ID so a stale action does not clear a newer scene;
- no custom socket, Scene Document integration, rounds, history, or per-scene use tracking.

Later Narrative Scene work may add rounds and rules keyed by the scene ID only after their playtest behavior is sufficiently defined.

## Public milestone 0.0.20 — Point of Interest Item foundation ✅

Purpose: give Investigation its first reusable building block — a GM-authored Point of Interest **definition** Item — without settling the Investigation execution/persistence architecture.

Delivered:

- `pointOfInterest` Item type with native `name`/`img`;
- `PointOfInterestDataModel` with `publicDescription`, `gmContext` (both declared as `htmlFields`), `showDifficultiesToPlayers` (initial `false`), and `information[]`;
- each `information` entry has a stable `id` (Foundry `randomID`, generated only on creation), a canonical `SkillKey`, an integer `difficulty ≥ 1` (no upper bound), and plain-text `content`;
- a defensive reader that drops entries with a non-canonical skill / blank id / out-of-range difficulty;
- a minimal GM authoring ItemSheet: identity, two toggled ProseMirror fields (matching the Ability sheet's editor pattern), the DT-visibility toggle, and an add/remove PERÍCIA · DT · INFORMAÇÃO table;
- the ItemSheet withholds private authoring content from the non-GM render context (presentation boundary only, not secure transport);
- focused schema/reader/editor/id tests.

Also delivered in this release: using an Ability from the Agent Sheet now posts a plain chat card with its name and description, spoken by the Agent.

Explicitly not included:

- Investigation Application and the Investigar/Examinar/Interagir/Recapitular/Compartilhar flows;
- Check Dialog integration, information revelation, PD consequences;
- discovered/execution state (it will reference `information[].id`, and lives elsewhere);
- reorder of information rows;
- Aptitude specialization as a distinct entry;
- secret skills, unlock conditions, Narrative Scene link;
- a POI compendium;
- the sanitized player-facing projection.

## Public milestone 0.0.22 — Equipment + Agent Inventory foundation ✅

Purpose: give Agents a minimal, structurally correct inventory of non-Ability gear without inventing combat, weight, load, slot, or quantity mechanics the playtest does not yet establish.

Delivered:

- a new `equipment` Item type with `general`, `weapon`, and `tool` structural categories;
- `EquipmentDataModel` with a description and one optional `{ value, max }` uses counter;
- a minimal Equipment Item Sheet;
- a functional Inventory tab on the Agent Sheet;
- Equipment embedded on an Agent as a normal Item;
- Inventory cards matching the same visual density as Ability cards;
- manual `uses` adjustment from the Inventory card, with no automatic consumption;
- Equipment chat publishing that never consumes `uses`;
- an `Equipamentos` compendium with Armas and Ferramentas folders, seeded with the weapon and Ordo tools confirmed by the playtest;
- external Ability and Equipment drops now work on an editable sheet even with Edit Mode off, while Edit Mode still protects edit/remove and other structural operations;
- embedded reorder continues to use Foundry's native sheet behavior;
- no invented provenance/`sourceUuid` for Equipment;
- no Ordo-tool-specific automation in this milestone.

### Equipment quantity / stacks

A short follow-up Inventory subfeature, not yet implemented. Decisions already closed for when it ships:

- `quantity` belongs technically to `EquipmentDataModel`, as a required integer `>= 1`, default `1`;
- it conceptually represents how many of that entry an Agent owns while the Equipment is embedded; outside an inventory it may remain `1` internally;
- pack seeds stay at `quantity: 1`;
- the Inventory card should present it compactly, likely `×N` only when `N > 1`;
- the editing UI is still undecided and will be designed when this subfeature is implemented;
- `quantity` is independent from `uses`;
- there is no automatic merge on drop — dropping the same Equipment again creates another embedded instance, preserving independent state, especially for Equipment with `uses`.

Not implemented in this milestone.

## Later internal milestone — Playability polish

Purpose: remove friction from an actual session before expanding the rules surface.

Candidates:

- resource editing UX;
- check-dialog polish;
- validation/error states;
- chat-card readability;
- sheet resize behavior;
- permission handling;
- localization structure;
- quality-of-life improvements found during real sessions.

The exact scope should be driven by playtesting, not predetermined feature count.

## Later milestone — Expanded Ability behavior

Only after its data lifecycle is understood well enough to choose a stable model.

Questions to answer first:

- Which additional Ability behaviors are stable enough for automation?
- Which actions need independent chat/use workflows?

## Later internal milestone — Semantic Effects + ActiveEffect UX

Purpose: provide a player-friendly layer over confirmed temporary and persistent modifiers without exposing raw Foundry data paths or creating an arbitrary AbilityEffect DSL.

Initial direction:

- keep Foundry Active Effects as native infrastructure where they fit the lifecycle of a modifier;
- hide raw `system.*` paths from normal users behind canonical, localized targets;
- add small reusable semantic operations only when confirmed mechanics require them;
- separate **selection rules** from the **effect operation** applied to the selected target;
- let the same semantic primitive be reused by Ability, Equipment, Active Effect preset, or another future source when the rule is actually the same;
- support ready-made presets and drag-and-drop workflows where Foundry's native Active Effect lifecycle is useful;
- keep advanced/raw-path authoring outside the normal OP2 UX.

First concrete selection pattern:

- choose exactly one skill filtered by its canonical `baseAttribute`;
- reusable filters: `mind`, `physical`, or `emotion`;
- the eligible list must come from the skill registry rather than hardcoded skill names.

First candidate operation:

- set the selected skill die to `d6`.

Observed candidates from the current playtest sheets:

- Conhecimento Técnico → choose one Mind-based skill and set it to `d6`;
- Esforço e Suor → choose one Physical-based skill and set it to `d6`;
- Ímpeto → future candidate for a distinct operation that increases an attribute by one die step for a duration.

`setSkillDie(d6)` and `increaseAttributeStep(1)` are intentionally different semantic operations. Do not collapse "set to a die" and "increase by steps" into one generic modifier just because both can eventually map to data changes.

Open questions:

- whether Aptitude specializations are eligible when a rule asks for one Mind-based skill;
- whether and when a previous selection can be changed;
- which semantic operations should materialize as Active Effects and which should instead participate in another system resolver;
- the exact player/GM authoring surface for presets and custom effects.

The implementation should grow incrementally: when a confirmed Ability introduces a modifier type the system does not yet support, add the smallest reusable semantic primitive for that class of rule instead of hardcoding behavior by Ability name.

## Later milestones — Investigation

Investigation is expected to become a first-class feature after the Agent/check foundation is stable.

The Point of Interest **definition** Item (0.0.20, above) is delivered. Remaining scope:

- the Investigation Application;
- Examinar flow;
- Interagir flow;
- Recapitular / Compartilhar;
- Check Dialog integration and information revelation;
- PD consequences;
- the sanitized player-facing projection of GM-only POI content;
- investigation-oriented applications or scene tooling for execution state.

Architecture decision must be made at that time regarding Scene data, Regions, flags, dedicated Documents, or application state.

## Deferred until new playtest material

### Threats

Do not implement a threat Actor based on assumptions from the previous system.

### Definitive combat engine

Do not lock in attack, defense, initiative, damage, wounds, trauma, or weapon architecture before the relevant playtest material is reviewed.

### Rituals / paranormal subsystems

Do not port the previous system's ritual model into this project without new-system rules.

## Release discipline

Internal milestones do not require a tag or GitHub Release. When a public `0.0.x` release is explicitly approved, it should:

- have one clear architectural or user-facing purpose;
- update `CHANGELOG.md`;
- update `system.json` version and download URL;
- document schema changes before shipping them;
- include manual validation steps;
- avoid bundling unrelated features simply to make the version look larger.
