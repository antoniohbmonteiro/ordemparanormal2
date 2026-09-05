# AGENTS.md

## Purpose

This repository contains the unofficial community Foundry VTT system **Ordem Paranormal 2**.

The project is built incrementally while the public playtest evolves. Coding agents must prefer correctness, explicit boundaries, maintainability, and reversible changes over speculative completeness.

## Hard rules

- Target **Foundry VTT v14+** and current public Foundry APIs.
- Inspect the current repository before making claims about files, paths, APIs, behavior, versions, releases, or architecture.
- Do not invent playtest rules, formulas, relationships, persistence models, or automation that are not confirmed.
- Keep game-rule logic out of sheets, click handlers, templates, and Foundry-specific adapters when it can be expressed as typed domain logic.
- Prefer small incremental changes over broad rewrites.
- Preserve healthy existing code and established boundaries.
- Player- and GM-facing text is **Portuguese (Brazil)**.
- Code identifiers, files, classes, functions, types, tests, architecture names, and commits are **English**.
- Code comments are English and only when they add useful context.
- Do not distribute protected official prose, artwork, maps, compendiums, pre-generated characters, or other copyrighted assets without explicit permission.
- Keep the project clearly unofficial.

## Plan review protocol

When the user asks for a review of an implementation Plan, there are only two valid outcomes:

- **SIM** — full approval. The Plan can be implemented exactly as written. There must be no required correction, caveat, or "small change" after approving it.
- **NÃO** — use this if **any** change is required before implementation. State exactly what must change and what the coding agent should do differently.

If any adjustment is necessary, however small, the answer cannot be `SIM`. Do not approve a Plan and then provide corrections. Do not extend Plan review with optional improvements that are irrelevant to safe implementation.

## Technical baseline

- Foundry VTT v14+.
- TypeScript with strict typing.
- Vite.
- ES Modules only.
- `TypeDataModel` for system document data.
- `ApplicationV2`-family APIs for new applications.
- `ActorSheetV2` / `ItemSheetV2` for system sheets.
- Modern public Foundry APIs.
- Vitest.
- Node.js version must satisfy the current `package.json` engine requirement.
- System ID is permanently `ordemparanormal2`.

Do not add a Foundry v13 compatibility layer unless a concrete requirement is explicitly approved.

## Sources of truth and repository verification

Use this order when investigating a change:

1. Current source code, tests, manifests, and pack sources on the working branch.
2. `docs/ARCHITECTURE.md` and `docs/DOMAIN_MODEL.md` for intended boundaries.
3. `docs/PLAYTEST_FEATURE_NOTES.md` and `docs/ROADMAP.md` for planned or provisional work.
4. Current public playtest material for rule confirmation.
5. Current Foundry v14 documentation/API when framework behavior is uncertain.

Documentation may lag behind implementation. If a document conflicts with current shipped code, do not silently code against the stale statement. Identify the drift and preserve current implemented behavior unless the task explicitly changes that behavior.

## Architectural principles

Apply Clean Architecture principles pragmatically. Dependency clarity matters more than ceremony.

```text
presentation / applications
          ↓
features / application orchestration
          ↓
core domain

Foundry integration lives at explicit framework boundaries.
```

Prefer:

- strong explicit types;
- small cohesive functions;
- narrow public APIs;
- pure deterministic rule functions;
- immutable inputs for rule evaluation when practical;
- adapters around Foundry concerns;
- feature/use-case orchestration separate from UI;
- DataModels that represent persisted source state clearly;
- tests close to the responsibility they validate.

Avoid:

- God Objects;
- giant workflow classes;
- giant files that mix unrelated responsibilities;
- `any` except for isolated, documented Foundry typing gaps;
- duplicated constants and repeated document-path magic strings;
- hidden side effects;
- speculative abstractions;
- empty interfaces or folders created "for later";
- generic repositories/services/effect engines without a concrete need;
- dependence on Foundry's internal HTML structure when a public API or scoped presentation solution exists.

## Current source organization

The repository currently uses these major boundaries:

```text
src/
├── main.ts
├── bootstrap/
├── config/
├── core/
│   ├── abilities/
│   ├── actors/
│   ├── checks/
│   ├── dice/
│   └── narrative-scenes/
├── application/
│   └── checks/
├── adapters/
│   └── foundry/
│       ├── abilities/
│       ├── actors/
│       ├── chat/
│       ├── dice/
│       ├── items/
│       ├── narrative-scenes/
│       ├── occupations/
│       └── profiles/
├── documents/
│   ├── actor/
│   ├── chat/
│   └── item/
├── features/
│   ├── abilities/
│   ├── checks/
│   ├── narrative-scenes/
│   ├── occupations/
│   └── profiles/
├── applications/
├── migrations/
├── qa/
├── ui/
└── types/
```

This layout is descriptive, not a reason to create speculative folders. Add a new boundary only when a real responsibility requires it.

## Dependency rules

### `core/`

Core rules should be framework-independent whenever practical.

Core may depend on other core modules and standard TypeScript/JavaScript features.

Core must not depend on:

- `game`;
- `Hooks`;
- Foundry `Actor`, `Item`, `Roll`, or `ChatMessage` documents;
- the `foundry` namespace;
- DOM APIs;
- sheets/applications;
- persistence;
- chat rendering.

### `application/`

Application code coordinates typed use-case behavior. It may depend on core rules and narrow ports/adapters, but it must not know sheet markup or Foundry HTML structure.

Do not create a use-case class merely to wrap a trivial function.

### `features/`

Features own cohesive user-facing workflows and orchestration. They may coordinate domain logic and Foundry-aware adapters, but should not duplicate rules already represented in `core/`.

### `adapters/foundry/`

Adapters own framework translation and side effects such as:

- reading current Actor/Item state;
- permissions;
- Foundry Roll evaluation;
- ChatMessage persistence;
- compendium/world-document lookup;
- world/client settings;
- narrow compatibility-sensitive Foundry integration.

Do not leak Foundry documents into pure domain rules when a small typed input is enough.

### `documents/`

Documents own `TypeDataModel` definitions and document-specific serialization/derived-data concerns. Do not turn DataModels or document classes into feature coordinators.

### `applications/` and `ui/`

Applications, sheets, templates, styles, and view models display state and send user intents. They may format resolved data, but must not redefine game rules.

### `bootstrap/`

Bootstrap owns Foundry lifecycle registration and startup wiring. Keep feature behavior out of `main.ts` and registration functions.

### `migrations/`

Migrations exist only for persisted data that actually shipped and needs compatibility. Do not add migrations for internal prototypes that never shipped.

## Current domain scope

### Actor types

Current Actor type:

- `agent`

Do not introduce a `threat` Actor until the current playtest provides a sufficiently stable threat model.

### Item types

Current Item types:

- `profile`
- `occupation`
- `ability`

### Agent persisted state

The current Agent model includes:

- level `1..10`;
- `appearance.accentColor` as an optional canonical accent;
- PV under `resources.health`;
- PD under `resources.determination`;
- Físico / Mente / Emoção attributes;
- skills;
- independent Aptidão specializations;
- a legacy occupation string retained only as migration input while direct upgrades require it.

Profile and Occupation are represented by embedded Items, not duplicated as active Agent system fields.

PV and PD remain directly editable. Do not introduce automatic formulas without an explicitly confirmed rule.

Ímpeto is **not** a universal Agent resource. Special resources belong to the Ability that provides them.

## Accent color behavior

Accent color is presentation-oriented persisted state with explicit ownership rules.

- Canonical stored format is uppercase `#RRGGBB`.
- Effective Agent accent resolves in this order:
  1. Agent `system.appearance.accentColor`;
  2. current embedded Profile `system.accentColor`;
  3. system default accent.
- A Profile accent is a **seed/default**, not the ongoing owner of the Agent's color.
- First Profile assignment may seed the Agent accent when the Agent has no stored accent.
- Replacing/removing a Profile, or changing an embedded Profile accent, must preserve an already effective legacy color rather than unexpectedly recoloring the Agent.
- Core Profile color values come from the Profile pack sources; do not hardcode Profile behavior by display name.
- New Check Chat Cards snapshot their presentation accent separately from the versioned Check snapshot.
- Historical cards must retain their original presentation/fallback behavior.
- Semantic colors for success, failure, criticals, warnings, and errors must remain independent from the cosmetic Agent accent.

## Dice and checks

Normal die progression:

```text
d4 < d6 < d8 < d10 < d12
```

`d20` is exceptional/paranormal and must not enter normal step progression accidentally.

Current check rules:

- Attribute checks roll the selected attribute component.
- Skill checks combine the selected/current attribute component with the skill component.
- Aptidão checks use one independently stored specialization plus the selected/current attribute component.
- Skill and Aptidão checks default to the canonical base attribute, but the Check Dialog may choose another current Agent attribute for that Check only.
- A `DialogV2` is shown before the roll.
- DT is optional.
- DT success/failure is independent from critical state.
- Success by DT is `total >= difficulty`.
- Positive critical: at least two rolled dice show the same value and that value is `>= 6`.
- Critical failure: every rolled die shows `1`.
- RA is the highest individual rolled result.
- RB is the lowest individual rolled result.
- Per-component step adjustments are transient and do not update the Actor.
- Situational extra dice are real rolled dice with provenance and use only normal `d4..d12` values.
- A Check may roll at most four dice in total.
- With one to three dice, all results contribute to the total.
- With four dice, only the three highest results contribute to the total.
- All rolled dice, including a non-contributing fourth die, still participate in RA, RB, positive critical, and critical-failure analysis.

Do not invent generic numerical modifiers, rerolls, opposed-check tie rules, Help stacking, or other mechanics that are not confirmed.

## Check history and chat

A roll reads current Actor state at the time the action is performed.

Once resolved, chat history is historical truth. Versioned Check snapshots must preserve the resolved inputs/outcomes required to render an old result without recomputing it from current Actor state or future rules.

Do not mutate or reinterpret an old card because:

- the Actor improved later;
- a resource changed;
- a registry label changed;
- a Profile or accent changed;
- rule code changed.

Presentation-only data such as the Agent accent may use its own presentation snapshot/flag rather than changing the Check snapshot schema when the mechanic itself is unchanged.

## Profile and Ability grants

An Agent may own at most one embedded Profile Item.

A Profile currently contains:

- optional `accentColor`;
- ordered `abilityGrants` containing canonical non-embedded Ability source UUIDs.

Profile is a source of grants, not the owner of granted Ability runtime resources.

Confirmed core relationships include:

- Executor → Ímpeto
- Analista → Avaliação
- Vigilante → Prontidão

Grant behavior must use canonical references and provenance, never display-name hardcoding.

If a canonical Ability already exists manually on the Agent:

- do not duplicate it;
- do not adopt or overwrite its provenance;
- consider the grant satisfied;
- preserve the manual Ability when the Profile is removed or replaced.

Only Abilities generated and marked as belonging to the relevant Profile grant may be removed by Profile reconciliation.

## Occupation boundary

An Agent may own at most one embedded Occupation Item.

Current Occupation behavior is identity/lifecycle only:

- native Item name/image;
- selection/replacement/removal/editing;
- reusable world/compendium sources;
- no Ability grants;
- no bonuses;
- no provenance relationships;
- no name-based mechanics.

Do not infer Occupation mechanics from Ability folder organization or from the previous Ordem system.

## Ability boundary

An Ability may contain:

- description;
- structured cost;
- at most one optional owned resource with `value` and `max`.

The current automated Ability behavior is deliberately narrow. Costs may consume PD or the resource on the same Ability. Do not create a generic effect DSL/engine just to anticipate future Ability mechanics.

## Agent Sheet UX

The current Agent Sheet is VTT-first and should preserve native Foundry window behavior.

Current high-level layout:

- main content area on the left;
- fixed Perícias dock/sidebar on the right;
- content tabs for Habilidades, Inventário, and Notas.

Do not reintroduce older collapsed/sidebar/expanded Skills state unless a new task explicitly asks for it.

### Edit Mode

Edit Mode is local presentation state, not persisted Actor data.

- `isEditable` remains the Foundry permission boundary.
- Structural/configuration controls require both edit permission and local Edit Mode.
- Runtime state such as PV, PD, Ability use, and Ability resource adjustments remains usable with permission independently of Edit Mode.
- Checks, tabs, and Aptidão interaction are not gated by Edit Mode.
- Leaving Edit Mode or closing the sheet must not leave structural picker applications active.

### Sheet settings and accent

Agent Sheet settings are opened through the native window header controls and require edit permission, but are independent of Edit Mode.

Prefer scoped CSS and public sheet/application APIs over DOM hacks or assumptions about Foundry's internal markup. Preserve native controls such as Copy UUID.

## Narrative Scene boundary

The system currently supports one active **Narrative Scene** as rule/application state.

Current persisted shape is intentionally minimal:

```text
{id, name}
```

Current lifecycle:

- one world-persisted active Narrative Scene;
- GM-only start/end management through the dedicated `Narrativa` sidebar tab;
- informational HUD showing the active scene name to clients;
- explicit end guarded by the expected active scene ID so stale actions cannot clear a newer scene.

Do not couple this lifecycle to Foundry Scene documents, Canvas state, Combat, rounds, or a custom socket unless a later confirmed requirement justifies it.

The right-sidebar registration is compatibility-sensitive and intentionally isolated behind its Foundry adapter. Do not spread that integration pattern through unrelated code.

## Investigation and other future features

Investigation / Points of Interest is planned but its persistence architecture is not yet settled.

When implementing it:

- re-check current playtest material first;
- keep public POI information separate from GM-private content;
- do not send undiscovered private information to a player browser merely to hide it with CSS;
- do not choose Scene flags, Items, Regions, or another persistence mechanism by convenience before the feature Plan establishes the boundary;
- keep narrative judgment with the GM where the rules require it.

Other currently deferred or incremental areas include:

- contextual Ability behavior such as Foco Mental;
- Help, with GM approval and provenance;
- Opposed Checks, with tie behavior still requiring confirmation;
- Inventory/equipment mechanics;
- definitive combat;
- threats;
- rituals/paranormal subsystems beyond confirmed playtest rules.

Do not import assumptions from the previous Ordem Paranormal system.

## Foundry API policy

Before implementing framework-dependent behavior, verify the current Foundry v14 API instead of copying patterns from v13 or older systems.

Use public APIs wherever possible.

If a compatibility-sensitive or internal API is unavoidable:

- isolate it behind one adapter;
- document why it is necessary;
- keep the rest of the system unaware of it;
- add focused tests where practical.

## Data migrations

Use migrations only for persisted released data that needs compatibility.

Migration behavior must be:

- versioned;
- idempotent where practical;
- safe on partial failure;
- explicit about which persisted representation is being replaced.

Do not infer sources or provenance by display name during migration unless an explicitly approved migration rule requires it.

## Compendiums and content

Reviewed source data for system-owned packs lives under `packs-src/` and generated Foundry packs live under `packs/`.

Treat pack source JSON as the editable source of truth; do not hand-edit generated LevelDB output.

Use canonical Foundry v14 compendium UUIDs and consume UUIDs provided by Foundry indexes rather than reconstructing them from names.

System-owned content may include original metadata, mechanics, confirmed names, and appropriately licensed assets. Do not copy protected official descriptions or artwork.

## Testing and validation

Use the smallest useful validation loop while working, then run the complete project gate before declaring implementation complete.

Typical loop:

```text
focused Vitest test(s)
→ npm run typecheck when types change
→ npm run check before completion
```

`npm run check` is the project release-quality gate and currently performs type checking, the Vitest suite, and the production build.

Use three validation levels as appropriate:

1. Pure domain unit tests.
2. Boundary/integration tests with minimal Foundry shims/mocks.
3. Manual Foundry v14 smoke tests for Document registration, permissions, sheets, drag/drop, rolls, chat, applications, resizing, and other runtime behavior.

Do not make browser/UI tests the only validation of game rules.

When changing templates/styles, test the relevant native Foundry states too: hover/focus, window controls, permissions, rerenders, resizing, and scroll behavior.

## Versioning and releases

Early development uses `0.0.x` versions.

Before a release, keep all version-bearing files synchronized:

- `package.json`;
- `package-lock.json` top-level version;
- `package-lock.json` root package version;
- `system.json`.

Also:

- update `CHANGELOG.md` for the release;
- ensure `system.json` download URL matches the same version and expected asset name;
- do not claim features that are only planned or documented.

The repository release workflow is tag-driven. For a release tag `vX.Y.Z` it validates the manifest/package versions and download URL, runs `npm run check`, builds the system archive, creates/updates the GitHub Release assets, and publishes the package version to Foundry when configured.

Do not create/push a release tag or publish a release unless the user explicitly asks for it.

## Git discipline

Use Conventional Commits in English.

Examples:

```text
feat(abilities): add profile grants and core compendiums
feat(checks): add extra dice support
fix(sheet): preserve native window controls
```

Do not:

- force-push shared branches unless explicitly requested;
- rewrite unrelated user changes;
- create tags/releases without explicit instruction;
- mix unrelated cleanup into a focused feature change.

Before finishing an implementation, report:

- summary of the change;
- files changed;
- validation commands/results;
- relevant manual Foundry smoke test;
- `git add` command;
- suggested Conventional Commit;
- push command when appropriate.

## Change discipline

Before adding or expanding a subsystem, ask:

1. Is the rule actually confirmed by the current public playtest?
2. Is this persisted domain state, derived state, application orchestration, Foundry integration, or presentation?
3. Can the rule be represented and tested without Foundry?
4. Does a current responsibility justify the abstraction being added?
5. Does this preserve historical data and provenance correctly?
6. Will this make the next playtest change easier or harder to absorb?
7. Is there a smaller reversible change that satisfies the requirement?

When uncertain, prefer the smaller correct design and surface the unresolved rule or architectural decision instead of inventing it.
