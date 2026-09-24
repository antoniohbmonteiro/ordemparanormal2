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

Adventure Agent imports use complete versioned mechanical presets, validated against the skill registry. New Actors initialize PV/PD current values to explicit preset maxima; reimport preserves current values without a clamp or capacity calculation. Names initialize exactly from the preset and later renames remain preserved. Managed statistics, images and portable canonical embedded selections reconcile against a completed persisted baseline. Optional Ability resource structure is canonical; an existing current value survives when both representations have a resource. Manual Abilities and unrelated Items, effects, flags and token settings remain outside importer ownership.

Adventure-imported Actors, Journals and Scenes use equivalent type-specific Folder trees. Folder provenance owns the Folder identity and presentation, while document placement is initialized once and then becomes user-owned. Folder contents do not inherit importer ownership.

The preset Ability list is complete, including effective Profile grants. Heitor explicitly replaces his embedded Executor grant with Ímpeto (Aprimorado), whose UUID is used in `profileGrant` and whose canonical resource maximum is five. This is an import-local snapshot override; the canonical Executor still grants base Ímpeto. Manual exact-UUID Abilities satisfy a desired reference without changing their provenance; base Ímpeto does not satisfy the improved UUID. No global equivalence, UUID-to-UUID resource transfer, or name-based mechanic is introduced.

## Adventure Scene ownership

Adventure Scene presets are presentation/configuration data, independent from the active Narrative Scene rule state. The current catalog imports one basement Scene for each materialized Act through the same assets/handouts/Actors pipeline. Token references use imported Agent provenance rather than names or authoring Actor IDs. Scene and embedded identities have separate versioned import provenance, revision and a completed managed baseline.

Reimport preserves manual content and runtime placement/state, including during restoration of managed configuration. New or recreated documents initialize their state from the preset. Only importer-owned obsolete embedded documents can be removed, subject to manual-reference checks. Baseline divergence concerns managed configuration and inventory, not normal movement, door toggles or fog exploration. A Scene can receive manual Regions/POIs later without recreation; this feature creates none.

The Act I revision 2 preset contains 168 Walls (three regular and six secret doors), three system-icon interaction Tiles, one optional opened-bookshelf Tile, five linked Agents, one Level and three labels. The bookshelf Tile uses a 200×440 PNG generated locally in the World from the user-provided Act II map. Its controller keeps the two Wall references and includes the Tile only when that output is available. Act I without the output retains its mechanical controls. Tile visibility remains mutable game state outside the managed baseline. The Act II revision 1 preset contains 145 Walls, two regular doors, five linked Agents and one Level, with no Tiles, Drawings or Regions. Both presets resolve their maps and Tokens through semantic assets and can evolve through the existing incremental reconciliation.

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

**World `pointOfInterest` Item = concrete campaign entity; compendium/preset = source/template.** Investigation uses World POIs, not Actor-embedded Items. Its `system` holds authored content; separate runtime flags on the same GM-controlled Item hold global visibility and Agent knowledge. A compendium Item must be imported or created as a World Item before Scene or Region use. Migration 3 also covers older POIs embedded in Actors and unlinked Token ActorDeltas.

Native `name` and `img` are not duplicated in `system`. The canonical authored `PointOfInterestDataModel` fields are rich-text `publicDescription` and GM-private `gmContext`, plus ordered `information[]`. Each information has a stable, POI-unique `id`, plain `content`, and at least one `approaches[]` entry. Each approach owns its skill, integer `difficulty >= 1`, and `showDifficultyToPlayers`; Aptidão also requires a canonical specialization. Duplicate approaches for the same skill or Aptidão specialization within one information are invalid. Visual skill groups are derived from the ordered information and approaches. A single information ID owns knowledge across all its approaches. There is no automatic clue resolution.

`skills` remains an optional `AnyField` in the DataModel only while older worlds can require Migration 3. It has no default and no new authoring, importer, or projection path writes it. The field preserves even malformed legacy input for the migration's global, read-only pre-flight; `migrateData` does not convert POIs or interpret partial update deltas. The pre-flight checks every World, Actor-embedded, and unlinked Token-delta POI and reports every unsafe document before any write. Apply replaces the whole authored `system` with `publicDescription`, `gmContext`, and `information`, verifies the stored source no longer has `skills`, then advances the world migration version only after all documents succeed. An I/O failure can leave earlier documents migrated; rerunning skips them. Remove the compatibility field only when support for pre-Migration-3 worlds ends or another upgrade path can read their old source safely.

The Adventure Importer creates the 29 Act I and 25 Act II POI presets as World Items in an Item Folder tree. Both recognized PDF editions use the same presets. Provenance is independent of display name. Its managed baseline reconciles authored `system` fields; the runtime visibility and knowledge flags are excluded from importer digests and ordinary updates. Migration 3 compares an intact imported legacy POI against its old baseline using the explicit `{publicDescription, gmContext, skills}` shape, consolidates the four known duplicate pairs across three presets, remaps their retired knowledge IDs per Agent, and writes a baseline for the new shape. A manually edited imported POI receives only mechanical conversion; choosing restore later remaps those four aliases before replacing its authored content. Name, image, ownership and Folder edits remain user-owned. It creates no Region or association. Skill clues needing unsupported conditions remain GM context for manual handling.

The POI ItemSheet is a GM authoring tool. Its non-GM context omits private fields as a presentation measure, not a secure transport boundary. World POIs used by this feature must remain GM-controlled: a POI with non-GM Item access is rejected by association and authorized projections. The player-facing Investigation Application receives only a GM-built, sanitized projection.

### Scene membership and Region association

`flags.ordemparanormal2.pointOfInterestItems` on the Foundry Scene is a deduplicated list of World `Item.<id>` UUIDs. It defines the POIs in that Scene, including POIs with no Region. The dedicated ApplicationV2 Scene panel is opened from the Investigação Scene Controls group. The GM manages membership and visibility there; players see only POIs authorized for them. A POI appears once even when several Regions point to it.

Foundry Regions own ordered Shapes, holes and spatial placement. `flags.ordemparanormal2.pointOfInterest = {itemUuid}` associates a Region with one World POI. Region creation or association change ensures Scene membership through an active-GM hook; initial active-GM reconciliation does the same for existing Regions. While any Region in a Scene points to a POI, the panel disables removal and the mutation rejects a stale removal attempt. Unlinking or deleting a Region never removes the POI automatically; after the last Region is unlinked, the GM may remove it manually. Inclusion failure is reported to the GM and can be recovered by reconciliation.

An old `Compendium...` Region association is invalid and inactive in this flow. It adds nothing to Scene membership, is not imported or copied automatically, and requires the GM to create/import a World POI and reassociate the Region. No Data Migration changes these associations or old Region runtime flags.

The RegionConfig POI tab edits only the association, preserving native Region fields and other flags. The World-only POI picker supplies the Item UUID. The Scene list establishes context; Region geometry only determines the Canvas representation and hit test.

### Global visibility and per-Agent knowledge

`flags.ordemparanormal2.pointOfInterestVisibility = {mode, users, notified}` on the World Item controls visibility globally across Scenes. `mode` is `hidden`, `everyone`, or `users`; a missing flag is hidden. `users` identifies selected players, and `notified` preserves the existing at-most-once generic private notice when a user first gains access. Canvas and panel display only the authorized Scene projection. Their invalidation contains no private content and triggers a fresh query.

`flags.ordemparanormal2.pointOfInterestKnowledge = {agents: [{actorUuid, informationIds[]}]}` is the authoritative persistent knowledge state. Each World Agent knows its own IDs; entries are never combined across Agents. UUIDs are values in an array, never object keys in a Foundry update path. A player-owned Agent Actor is not trusted as the knowledge source. The GM chooses recipient World Agents when revealing information; “all Scene Agents” means distinct Agents with a Token in the Scene. Information remains known to the Agent across Scenes. A selected Agent's known content alone enters the player's projection.

Only the active GM writes Scene membership, Item visibility or Item knowledge. A second GM forwards UI intent through public `User.query`; the active GM uses the authoritative requester in query context, checks GM authorization, current Scene/Item state, ownership and payload, serializes writes, and broadcasts invalidation after a successful write. Players cannot use mutation queries. Old Region visibility and information flags remain physically possible but inert; their previous reveals start hidden and empty in the new model.

**Accepted metadata exposure:** Scene flags replicated to clients can reveal UUIDs of hidden POIs. No secret content, private DT or Agent knowledge is delivered by these flags; access to content is checked by the active-GM projection.

POI canvas presentation remains transient. Investigation Mode is client-local, initially OFF, and the renderer uses public Region polygon geometry and Level eligibility for drawing and hit testing. The same renderer serves both roles using the sanitized Scene projection for player eligibility and labels. GM right-click in select-POI mode manages global Item visibility; Canvas left-click and panel open the same Item-keyed Investigation window. Native Region drawing and Token interactions retain their existing behavior.

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
component-only shape, and V3 remains frozen with resolved situational extra
dice. New messages use `CheckSnapshotV4`, which adds applied Ability-use
provenance and the confirmed cost. Each Ability-sourced extra die maps
one-to-one to one provenance record. Historical Check Request and Opposed Check
envelopes keep their existing versions and can contain V3 or V4 results.

## NEX

NEX exists as a concept in the playtest, but its persisted format is intentionally **not** part of the initial Agent model until the public material makes that representation clear enough.

Do not assume percentage storage merely because the previous system used percentages.

## Ability Items and resources

Abilities are `ability` Items with a rich-text general description, an ordered collection of use forms, and at most one optional owned resource:

```text
description
resource                   object or null
├── value                  non-negative integer
└── max                    non-negative integer
uses[]
├── id                     non-empty unique string
├── name                   non-empty string
├── description            sanitized HTML
├── cost
│   ├── source             none | health | determination | resource
│   └── amount             non-negative integer
├── minimumLevel           null or integer 1..10
└── checkIntegration       null or typed PRE-ROLL modification
```

`value > max`, empty use collections, and zero-cost forms are valid. A resource cost always consumes the optional resource on the same Ability. Removing a referenced resource resets every resource cost to `none / 0` while preserving IDs, content, levels, and ordering.

Independent Ability use consumes the selected non-integrated form's configured cost. PRE-ROLL forms are instead selected in the Check Dialog and currently support only one `extraDie` modification using `d4..d12`. Applicability is `any`, one effective Agent attribute, or one canonical Skill; Aptitude is structurally distinct and cannot be stored as Skill applicability, though `any` and attribute applicability can include Aptitude Checks. Costs remain pending through Roll evaluation, are aggregated across the selection, and are revalidated before grouped payment. Described post-roll effects, rerolls, recovery, and broader automation remain deferred.

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

Investigation uses concrete World POIs, Scene participation and optional Region placement. `Examinar` delegates to the existing Agent Check workflow without supplying a POI DT or automatically revealing information. Narrative interpretation and manual revelation remain with the GM.

### Investigation Application

The ApplicationV2 window has `itemUuid` identity. Opening the same POI from another Scene focuses that window and updates its `sceneId` access context. A left-click on a visible Region while Investigation Mode is on, or a click in the Scene panel, opens it. The existing Canvas gesture respects Token priority and does not intercept native drag or selection.

The screen shows the native header, image, public description and a `Perícia | Ação | DT | Informação` grid. Skill groups and rows are derived from `information[].approaches[]` in saved order. The player sees a public DT or hidden-DT marker, and content only for IDs known by the selected Agent; each Aptidão row names its specialization. The GM sees full DTs, information content, a per-information reveal action, Agent known count, and `gmContext` enriched with secrets enabled.

The player selects one World Agent they own. A sole eligible Agent is selected automatically; several require explicit selection. Without one, public description remains visible and `Examinar` is unavailable. The selected Agent drives both known-information projection and `performAgentCheck`; Aptidão offers only specializations present in the POI approaches. The GM reveal dialog accepts selected World Agents and offers all distinct Token-linked World Agents in the Scene. Knowledge writes are GM-authoritative, idempotent and stored on the POI Item.

The active-GM query validates Scene membership, global visibility, GM-controlled World Item, Agent type and OWNER permission from the authoritative requester context. It rechecks access after asynchronous description enrichment. The player payload contains only whitelisted name, image, public description, skill rows, public DTs and known content. It excludes Item UUID, information IDs, unknown content, hidden DT values and `gmContext`. The GM receives a separate complete view. The number of information rows remains visible to authorized players. An unavailable active GM produces an error without exposing content.

## Tile interactions

A Foundry Tile may opt into a GM-only control interaction through the
`flags.ordemparanormal2.tileInteraction` flag. The flag stores only whether the
control is enabled and the embedded Wall/Tile IDs belonging to the controller's
parent Scene. It does not store an open state.
Enabling the control does not require a Wall target: a click on an enabled
controller with no configured Walls is accepted but makes no document changes.

The selected Door and Secret Door Walls are the authoritative state. If every
valid controlled Wall is open, the next interaction closes all of them and
hides the associated Tiles. Otherwise—including a closed, locked, or mixed
group—the next interaction opens every valid Wall and shows the associated
Tiles. Only each Wall's `ds` and each associated Tile's `hidden` field may
change; Wall types and movement, sight, light, and sound restrictions remain
untouched. A missing or invalid reference is ignored, and no Tile changes occur
when no valid controlled Wall remains.

The workflow is intentionally a narrow Scene-local control, not a trigger or
effect engine. It does not introduce scripts, macros, Regions, delays,
animations, or a system socket. Wall and Tile updates share one atomic Foundry
batch so clients never observe a successfully persisted mixed state.

The canvas observer uses the current Application.canvas surface when available,
falling back to Application.view only for Foundry v14 clients bundled with
PixiJS 7. A native TileConfig preview can make the original placeable report
not visible while its mesh retains valid hit-test geometry; this preview state
does not disable the control outside the Tiles editing layer.

The TileConfig extension keeps unsaved target selection in an application-local
draft. Only the native Tile form submission persists the full flag replacement;
closing the configuration window discards draft changes.

## Source-of-truth rule

Whenever the playtest changes:

1. update this document first if the domain assumption changed;
2. identify schema impact;
3. prefer migrations only for data that was actually persisted in a released version;
4. avoid compatibility code for internal prototypes that never shipped.

The `0.0.7` transition intentionally removes the development-only `system.profile` and `system.resources.impetus` fields without migration. Existing development Actors may be recreated or reconfigured manually.

The `0.0.8` transition relies on the `abilityGrants: []` field default for existing Profiles. Existing Abilities are never inferred, marked, or adopted by name.

The Occupation transition is versioned independently in a hidden world setting whose default is `0`. Migration 1 creates a local embedded Occupation from each non-empty legacy string before clearing that string. Conflicting pre-existing data is preserved and never resolved by name.

Migration 2 replaces the released Ability root `cost` with `uses[]` in world and embedded Ability Items. A meaningful valid legacy cost becomes one stable `legacy-use`; free, inconsistent, or non-positive legacy costs become an empty collection. Existing `uses` are authoritative, no Ability is inferred by name, and imported legacy sources use the same DataModel transformation.

### Investigation presentation

The Investigation Application is keyed by World POI Item UUID and requests an audience-specific projection for the current Scene and selected World Agent. Stored information and approach order, stable IDs and per-approach DT visibility stay on the Item; skill groups are derived. A player receives only sanitized public fields and content known to the selected Agent; the GM receives complete rows and `gmContext`. `Examinar` uses the selected Agent and existing Check Engine, without automatic DT comparison, PD cost or revelation. `Outra perícia` remains unavailable.

## Opposed Checks

An Opposed Check persists two canonical participant references, two requested `AgentCheckSelection` values, a minimal presentation snapshot and up to one `CheckSnapshotV3` per side. World Actors retain Actor UUIDs; unlinked Tokens retain Scene Token UUIDs and resolve through `token.actor`, never `baseActor`.

The requested label/context are historical creation-time presentation. A pending side displays that requested context. Once rolled, it displays the effective context reconstructed from the snapshot components, including an alternate attribute selected for that execution. The requested selections—not the effective alternate attribute—determine whether the title names one shared Check.

Comparison produces `pending`, `leftWon`, `rightWon` or `equalTotals`. `equalTotals` records only that both totals are numerically equal. The current public playtest does not specify how to choose a winner in that situation, so the system assigns no winner, trophy, damage, reroll or other consequence; RA, RB and critical state do not resolve it. The card describes it only as `RESULTADOS IGUAIS`.
