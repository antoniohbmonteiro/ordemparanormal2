# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

## [0.1.0] - 2026-09-04

### Baseline

- Established the first consolidated public baseline of the 0.1.x series from the capabilities already implemented through 0.0.22; this release introduces no new gameplay features.
- Preserved the system ID, stable update manifest, release download strategy, and existing world-data migrations for direct upgrades from 0.0.x.

### Licensing

- Development-branch source code is available under PolyForm Strict License 1.0.0 starting with the LICENSE migration. The project is source-available, not open source.
- Public releases through v0.0.22 were distributed under MIT. Copies already distributed remain subject to those MIT terms.
- Version 0.1.0 is the first public release distributed under PolyForm Strict License 1.0.0.
- Community pull requests follow the limited contribution permission in CONTRIBUTING.md and version 1.0 of the Contributor License Agreement in CLA.md.

## [0.0.22] - 2026-09-04

### Added

- Added the `equipment` Item type, its `EquipmentDataModel` (structural `general`/`weapon`/`tool` categories, description, and one optional `{ value, max }` uses counter), and a minimal Equipment Item Sheet.
- Added a functional Inventory tab to the Agent Sheet, listing embedded Equipment with the same card density as Habilidades, manual `uses` adjustment, and edit/remove actions.
- Added Equipment chat publishing, reusing the existing OP2 chat card presentation; publishing never consumes `uses`.
- Added the `Equipamentos` compendium (Armas and Ferramentas folders) seeded with the weapon and Ordo tools confirmed by the playtest.

### Changed / Fixed

- External Ability and Equipment drops now work on an editable Agent Sheet even with Edit Mode off; Edit Mode continues to be required for edit/remove and other structural operations, and for reordering an already-embedded Item.
- Aligned the Inventory tab's spacing and card density to match the existing Habilidades cards.

### Notes

- Equipment quantity/stacks remains deferred; see the Roadmap for the closed decisions that will apply once it ships.
- Dropping the same Equipment again does not merge into an existing stack; it creates another independent embedded instance.
- No automation specific to the Ordo tools was added in this release.
- No data migration is required.

## [0.0.20] - 2026-09-04

### Added

- Added a reusable, GM-authored Point of Interest Item (public description, GM context, a "show DTs to players" toggle, and a skill/DT/information table) as the foundation for the future Investigation feature. Each information entry keeps a stable id so later investigation state can reference it without storing discovery state on the Item.
- Using an Ability from the Agent Sheet now also posts a plain chat card with its name and description, spoken by the Agent.

### Notes

- The Point of Interest ItemSheet is a GM authoring tool; it hides the GM context and information table from non-GM viewers. This is a presentation boundary — sanitized player-facing distribution is future Investigation work.
- No data migration is required.

## [0.0.19] - 2026-09-03

### Added

- Added a per-Agent accent color, with a Sheet Settings entry in the window menu to customize it.
- Gave the bundled official Profiles their own visual identity: Analista (blue), Executor (red), Vigilante (green).

### Changed

- Applied the chosen accent color to the Agent Sheet's decorative elements.
- Preserved the accent color used at roll time in Check chat cards.
- Refined the Agent Sheet tabs and scrollbars.

### Notes

- Success, failure, critical, and warning colors remain separate semantic colors and are not affected by the accent color.
- No data migration is required.

## [0.0.18] - 2026-09-02

### Fixed

- Added the bundled Brazilian Portuguese translations as Foundry's temporary English fallback dictionary so clients using any locale without system translations no longer render raw localization keys.

### Notes

- The interface remains Brazilian Portuguese. Foundry uses `en` as the fallback dictionary for other active locales, so the `en` locale intentionally reuses `lang/pt-BR.json` until reviewed English translations are available.

## [0.0.17] - 2026-09-01

### Added

- Added a world-persisted Narrative Scene lifecycle with generated IDs and GM-only start/end management through a dedicated right-sidebar tab.
- Added a shared, strictly informational HUD that shows the active Narrative Scene name to every client without coupling it to Foundry Scene, Canvas, or Combat state.

## [0.0.16] - 2026-09-01

### Added

- Added a local Agent Sheet Edit Mode that reveals structural configuration without changing Foundry ownership semantics.

### Changed

- Presented Agent identity and die steps as readable sheet information during normal play while keeping PV, PD, Ability use, and Ability resource controls interactive.
- Restricted Profile, Occupation, Ability, portrait, level, and die configuration to Edit Mode, with Agent-owned pickers closed when the mode or sheet closes.
- Removed direct Profile and Occupation Item-sheet actions from the Agent Sheet in favor of their picker workflows.

## [0.0.15] - 2026-09-01

### Added

- Added the minimal `occupation` Item type, its DataModel and ItemSheetV2, and single embedded Occupation ownership for Agents.
- Added the `Ocupações` compendium with Artista, Cientista, Médico, Militar, Operário, Policial, Professor, and Profissional de Escritório as identity-only Items.
- Added world-data migration 1 and synchronous legacy-import preparation to preserve existing `system.occupation` text without resolving external Items by name.
- Added attributed Game-icons.net artwork for the Analista, Executor, and Vigilante Profile compendium Items.

### Changed

- Replaced the Agent Sheet's free-text Occupation control with selection, replacement, removal, editing, and drag-and-drop of an embedded Occupation Item.
- Shared the reusable catalog and picker lifecycle between Profile and Occupation while retaining domain-specific wrappers and Profile grant behavior.
- Corrected Profile and Occupation picker row sizing so item thumbnails remain inside their matching click targets.

### Notes

- Occupations contain no grants, provenance, bonuses, skills, resources, effects, formulas, or name-based automation in this release.
- The legacy `system.occupation` field remains hidden temporarily for upgrade compatibility, and migration progress is advanced only after all pending migrations succeed.

## [0.0.14] - 2026-09-01

### Added

- Added attributed skill and Aptitude-specialization icons to Check presentation.
- Added four deterministic Check QA scenarios and a client-side, GM-only Debug Mode for enabling their console tools.

### Changed

- Redesigned the Check Chat Card with a custom OP2 `ChatMessage` shell, compact critical and critical-failure presentation, and an expandable per-die roll breakdown.

## [0.0.13] - 2026-09-01

### Added

- Added a compact attribute selector to skill and Aptitude-specialization Checks, defaulting to each skill's registered base attribute.
- Added transient alternate-attribute execution using the selected Agent attribute's current die while preserving the skill die, per-component step adjustments, and situational extra dice.

### Changed

- Check history now explicitly covers alternate attributes through the existing resolved components in `CheckSnapshotV3`, without a new snapshot schema or Actor migration.
- Documented the later public confirmation that four-die Checks sum the three highest results; the implemented calculation is unchanged.

### Notes

- Attribute-only Checks remain fixed to their selected attribute, and alternate choices never update the Actor, skill registry, or UI preferences.
- The Chat Card layout, four-die limit, RA, RB, critical analysis, DT, roll mode, and Dice So Nice integration are unchanged.

## [0.0.12] - 2026-08-31

### Added

- Added individually identified situational `d4` through `d12` dice to Checks, with repeated dice and a domain-enforced four-die limit.
- Added immutable `CheckSnapshotV3` history for resolved extra dice while preserving the frozen V1 and V2 snapshot formats.
- Added five transparent Game-icons.net dice glyphs with individual CC BY 3.0 attribution.

### Changed

- Reorganized the Check Dialog around compact per-component step controls, optional DT, situational-die buttons, a live dice counter, and removable chips.
- When four dice are rolled, the effective Check total sums the three highest results while RA, RB, and critical analysis continue to use all four; this interpretation was provisional at release time and was later confirmed publicly.
- Extended the Foundry Roll adapter and chat card to preserve and present each situational die as an individual rolled result.

### Notes

- At release time, the available Playtest material did not identify which three of four dice were summed. A later public explanation confirmed the implemented three-highest interpretation.
- Ability automation, automatic costs, Help, opposed checks, rerolls, and generic modifiers remain outside this release.

## [0.0.11] - 2026-08-31

### Added

- Added sixteen attributed Game-icons.net SVGs and original concise mechanical descriptions to the Ability compendium.
- Added textual `Upgrade:` sections for the confirmed enhanced versions of Foco Mental and Ímpeto.
- Added `THIRD_PARTY_LICENSES.md` with individual icon authorship, source links, and CC BY 3.0 attribution.

### Changed

- Grouped the `Habilidades` and `Perfis` packs under the native `Ordem Paranormal 2` compendium folder.
- Organized Ability Items into reproducible Executor, Analista, Vigilante, and Ocupações folders without changing their IDs, UUIDs, provenance, or Profile grants.
- Updated the Ability sheet to render and edit the existing HTML description field through Foundry's native rich-text editor.

## [0.0.10] - 2026-08-31

### Added

- Added independent temporary `-4` to `+4` step adjustments for each Check Dialog component, without updating the Actor or promoting `d12` to `d20`.
- Added the official Community License seals exactly as supplied and documented their required presentation.
- Added a versioned, client-scoped Community License notice shown after Foundry reaches `ready`.
- Added `COMMUNITY_LICENSE.md` with a concise explanation and a link to the official license.

### Changed

- Replaced generic Ability tracker arrays with one optional Ability-owned `{ value, max }` resource and direct resource cost consumption.
- Updated Ability cards to show the temporary resource summary as `value/max` and kept resource editing on the Ability sheet.
- Updated the Agent Sheet layout and portrait alignment for the current VTT-first presentation.
- Updated README and release packaging to include the required non-official and artificial-intelligence notices, both official seals, and the Community License summary.

### Removed

- Removed tracker IDs, tracker aggregation, and the separate `Recursos Especiais` panel from the Agent Sheet.

## [0.0.8] - 2026-08-31

### Added

- Added ordered UUID-based Ability grants to Profile Items and a grant editor to the Profile sheet.
- Added source-provenance flags and coordinated Profile selection, replacement, removal, and embedded grant reconciliation.
- Added the system-owned `Perfis` and `Habilidades` Item compendiums with three Profiles and sixteen placeholder Ability names from the playtest sheets.
- Added reviewed JSON pack sources and reproducible LevelDB pack generation through the official Foundry CLI.

### Changed

- Profile snapshots now include only `system.abilityGrants` in addition to name, image, and type.
- External Ability drops now preserve their source UUID, allowing a manually owned matching Ability to satisfy a Profile grant without being adopted or removed.
- Profile catalog entries retain the canonical Foundry v14 compendium-index UUID.
- Release archives now include both generated packs and validate their `CURRENT` files.

### Notes

- Only Executor → Ímpeto, Analista → Avaliação, and Vigilante → Prontidão are declared. The other Ability origins and mechanics remain intentionally unspecified.
- Existing 0.0.7 Profiles receive the empty `abilityGrants` default; existing Abilities are never inferred or adopted by name, and no migration is included.
- The seed content contains names and empty system placeholders only. It includes no official descriptions, mechanics, artwork, Occupation Items, or invented Ímpeto tracker.

## [0.0.7] - 2026-08-30

### Added

- Added the `profile` Item type, its identity-only `ProfileDataModel`, and a minimal world/embedded Item sheet.
- Added a Profile picker backed by visible world Items and visible Item compendia, with search, source grouping, replacement, removal, and embedded editing.
- Added the `ability` Item type with description, structured costs, owned trackers, and a world/embedded Item sheet.
- Added automatic Ability use for free, PD, and Ability-owned tracker costs without partial consumption.
- Added generic owned-Item tracker aggregation and the permanent vertical `Recursos Especiais` panel on the Agent Sheet.
- Added Profile drag-and-drop handling and a synchronous uniqueness guard that prevents a second embedded Profile on an Agent.

### Changed

- Made the single embedded `profile` Item the exclusive source of truth for an Agent's Profile.
- Reduced fixed Agent resources to PV and PD; special resources such as Ímpeto belong to the Ability Item that provides them.
- Reworked the Agent Sheet into one coordinated layout with closed, half-open, and full Perícias states.
- Added compact Ability cards, native Ability drop/sort support, and localized use feedback.
- Updated Agent identity presentation, Profile ownership boundaries, localization, documentation, and version metadata for `0.0.7`.

### Notes

- There is intentionally no migration or compatibility layer for the removed `system.profile` and `system.resources.impetus` fields. Development Actors may lose those fields and must be recreated or reconfigured manually.
- No predefined Profiles, official text, or official artwork are distributed.

## [0.0.6] - 2026-08-30

### Added

- Added a Foundry v14 Check Dialog for current Agent check actions, with an optional positive-integer DT.
- Added pure success/failure resolution for checks with DT and persisted all new check messages as backward-readable `CheckSnapshotV2` snapshots.
- Added derived RA/RB values and independent positive-critical and critical-failure analysis to check chat cards without changing persisted snapshots.

### Fixed

- Linked prototype tokens by default for newly created `agent` Actors while preserving explicitly supplied values and leaving existing Actors unchanged.

## [0.0.5] - 2026-08-30

### Added

- Added `AGENTS.md` with coding, architecture, Foundry v14, testing, and copyright guidance.
- Added architecture documentation with explicit domain, application, Foundry integration, and presentation boundaries.
- Added current domain-model documentation for the planned Agent foundation and intentionally deferred systems.
- Added a staged `0.0.x` roadmap focused on small, reversible development milestones.
- Added `.editorconfig` and initial Node/Vite-oriented ignore entries for consistent project hygiene ahead of the runtime scaffold.
- Added strict TypeScript, Vite, Vitest, and the Foundry v14 typing boundary.
- Added the framework-independent `DieStep` domain and canonical Agent attribute keys.
- Added the verified 20-skill registry, including base attributes and Aptitude specializations.
- Added the first `AgentDataModel` with grouped resources, attributes, skills, and non-negative resource fields that permit temporary values above their maxima.
- Added the Foundry v14 `agent` Actor subtype registration and Brazilian Portuguese type label.
- Added the first Foundry v14 `AgentSheet`, registered through `DocumentSheetConfig` for the `agent` subtype.
- Added localized editing for Agent identity, resources, attributes, all canonical skills, and Aptitude specializations.
- Added compact accessible die controls, responsive dark styling, and ephemeral Aptitude expansion state.
- Added pure presentation view-model tests for registry order, update paths, die choices, and specialized skills.
- Added simple attribute, skill, and Aptitude specialization checks driven by canonical metadata.
- Added a Foundry Roll adapter that preserves each die result and verifies the resolved total.
- Added immutable versioned check snapshots and a minimal localized chat card.
- Added explicit extensible Foundry chat-mode forwarding and GM/OWNER roll authorization.
- Added automatic Dice So Nice compatibility through standard Roll-backed chat messages.

### Changed

- Simplified the public system title from `Ordem Paranormal RPG 2` to `Ordem Paranormal 2`.
- Updated README status and development commands for the runtime-and-Agent phase.
- Replaced the placeholder runtime entrypoint with the generated `dist/main.js` ES Module.
- Made attribute, skill, and Aptitude specialization names accessible roll controls while keeping die pills edit-only.

### Fixed

- Preserved the last valid Actor name when an empty name is submitted from the Agent Sheet.

### Notes

- No custom Actor class, Item type, difficulty, success state, critical rule, RA/RB, modifier, or check dialog is included.
- The Agent Sheet and simple-check workflow were manually validated in Foundry v14, including permissions, chat modes, immutable history, and Dice So Nice present or absent.

## 0.0.1 - 2026-08-29

### Added

- Initial Foundry VTT v14 placeholder system.
- Reserved system identifier `ordemparanormal2`.
- Minimal ES Module initialization hook.
- Project status, installation instructions, licensing, and non-official disclaimer.
