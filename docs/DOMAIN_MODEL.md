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

Adventure Agent imports use complete versioned mechanical presets, validated against the skill registry. New Actors initialize PV/PD current values to explicit preset maxima; reimport preserves current values without a clamp or capacity calculation. Names initialize from the actual portrait entry in the recognized user-supplied ZIP and later renames remain preserved. Managed statistics, images and portable canonical embedded selections reconcile against a completed persisted baseline. Optional Ability resource structure is canonical; an existing current value survives when both representations have a resource. Manual Abilities and unrelated Items, effects, flags and token settings remain outside importer ownership.

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

**World `pointOfInterest` Item = concrete campaign entity; compendium/preset = source/template.** Investigation uses World POIs, not Actor-embedded Items. Its `system` holds authored content; separate runtime flags on the same GM-controlled Item hold global visibility and Agent knowledge. A compendium Item must be imported or created as a World Item before Scene or Region use.

Native `name` and `img` are not duplicated in `system`. The canonical authored `PointOfInterestDataModel` fields are rich-text `publicDescription` and GM-private `gmContext`, plus ordered `information[]`. Each information has a stable, POI-unique `id`, plain `content`, at least one `approaches[]` entry, and `availability = {mode, condition}`. Mode `always` is ordinarily investigable and has a blank condition; mode `situational` is investigable only when the GM judges its non-empty textual condition satisfied. The system never interprets the condition; it is not a requirement engine, and availability belongs to the information, not to an approach. Information stored before availability existed has none and is read as `always`: the DataModel fills that default when it cleans the stored source, so no World migration exists. Information added in the ItemSheet starts as `always`. Each SkillApproach owns its skill, integer `difficulty >= 1`, and `showDifficultyToPlayers`; Aptidão also requires a canonical specialization. A SkillApproach may also hold one optional `difficultyOverride = {difficulty, condition}`: an alternative integer DT `>= 1` and the non-empty GM-private textual situation in which the GM uses it instead of the base DT. It is not interpreted automatically and is independent from information availability. Approaches stored without it stay valid as they are: the field has no initial value, so no migration exists, and approaches added in the ItemSheet have none. Duplicate approaches for the same skill or Aptidão specialization within one information are invalid. Visual skill groups are derived from the ordered information and approaches. A single information ID owns knowledge across all its approaches. Automatic skill resolution applies only to permanent information and base DTs; narrative and situational clues remain GM judgments.

The old POI `system.skills[]` shape is unsupported. There is no automatic migration to `information[].approaches[]`; during this 0.x phase, old POIs may need to be recreated manually or restored/reimported later. Agent skills are a separate domain and remain supported.

The Adventure Importer extracts 29 Act I and 25 Act II POIs from the recognized user-supplied PDF. `src/config/adventure-poi-sources/playtest-alpha.ts` permanently holds structural headings, edition mappings, image asset references and stable information IDs, with no narrative content. PDF.js page items, the edition-specific parser and the technical catalog produce in-memory presets before any asset materialization or World write. `PdfSourceAnalysis` remains recognition-only. The POI preset revision is 6; provenance and World Item identity remain stable across reimports. A DT cell printed as "6 ou 10" becomes base DT 6 with a `difficultyOverride` of 10, whose condition comes from the GM rule that explains the change; that rule then leaves `gmContext`. Its managed baseline reconciles authored `system` fields, omitting the default `always` availability so baselines recorded before availability existed stay valid; runtime visibility and knowledge flags are excluded from importer digests and ordinary updates. Name, image, ownership and Folder edits remain user-owned. It creates no Region or association. Explicitly conditioned rows, including clues requiring another finding, prior access, a particular character, player count or adventure state, become `situational` information with the printed prerequisite as their textual condition and a canonical ID bound explicitly in the technical catalog. They are no longer repeated in `gmContext`, which keeps narrative, access, tools, GM instructions and catalog context rows.

Revision 6 adds tools only for Agentes v1.1 Act II: 32 canonical source/form pairs in 12 POIs, yielding 34 appended original summaries (29 always, 5 situational). `playtest-alpha-act-two-tools.ts` holds explicit stable Information IDs, source UUIDs/form IDs, summaries, narrative prerequisites and structural Radio indices/counts. Six Laboratory bindings carry printed lengths 4/5/6; three Radio puzzles are extracted from the user's PDF and validated against its solution, with the exact Altar typo correction. The source table order and all existing Information IDs/content remain intact. Full official tool paragraphs and puzzle lists are not distributed as permanent content. Mapped long tool responses leave GM context, which retains brief guidance and manual media references. Wardrobe/Laboratory and Idol/Radio stay manual without ToolApproaches. The five conditional tool responses and the existing Camera/Perception and Powder/Occultism skill clues require GM revelation; normal readings never create paranormal Informations. Strict presets validate both approach branches and uniform mechanic configuration. Reimport 5→6 reuses World Items and existing preserve/restore/digest rules, without rewriting Knowledge, Discovery or other runtime flags. Act I, v1.0 and Sobreviventes are unchanged. The user approved the main Act II tool smoke; detailed advanced cases remain individually unconfirmed: [ACT_TWO_TOOLS_MANUAL_CHECKLIST.md](ACT_TWO_TOOLS_MANUAL_CHECKLIST.md).

The POI ItemSheet is a GM authoring tool. Its non-GM context omits private fields as a presentation measure, not a secure transport boundary. World POIs used by this feature must remain GM-controlled: a POI with non-GM Item access is rejected by association and authorized projections. The player-facing Investigation Application receives only a GM-built, sanitized projection.

### Scene membership and Region association

`flags.ordemparanormal2.pointOfInterestItems` on the Foundry Scene is a deduplicated list of World `Item.<id>` UUIDs. It defines the POIs in that Scene, including POIs with no Region. The dedicated ApplicationV2 Scene panel is opened from the Investigação Scene Controls group. The GM manages membership and visibility there; players see only POIs authorized for them, with expandable known clues and Recapitular during an active run. A POI appears once even when several Regions point to it.

Foundry Regions own ordered Shapes, holes and spatial placement. `flags.ordemparanormal2.pointOfInterest = {itemUuid}` associates a Region with one World POI. Region creation or association change ensures Scene membership through an active-GM hook; initial active-GM reconciliation does the same for existing Regions. While any Region in a Scene points to a POI, the panel disables removal and the mutation rejects a stale removal attempt. Unlinking or deleting a Region never removes the POI automatically; after the last Region is unlinked, the GM may remove it manually. Inclusion failure is reported to the GM and can be recovered by reconciliation.

An old `Compendium...` Region association is invalid and inactive in this flow. It adds nothing to Scene membership, is not imported or copied automatically, and requires the GM to create/import a World POI and reassociate the Region. No Data Migration changes these associations or old Region runtime flags.

The RegionConfig POI tab edits only the association, preserving native Region fields and other flags. The World-only POI picker supplies the Item UUID. The Scene list establishes context; Region geometry only determines the Canvas representation and hit test.

### Global visibility and per-Agent knowledge

`flags.ordemparanormal2.pointOfInterestVisibility = {mode, users, notified}` on the World Item controls visibility globally across Scenes. `mode` is `hidden`, `everyone`, or `users`; a missing flag is hidden. `users` identifies selected players, and `notified` preserves the existing at-most-once generic private notice when a user first gains access. Canvas and panel display only the authorized Scene projection. Their invalidation contains no private content and triggers a fresh query.

`flags.ordemparanormal2.pointOfInterestKnowledge = {agents: [{actorUuid, informationIds[]}]}` is the authoritative persistent knowledge state. Each World Agent knows its own IDs; entries are never combined across Agents. UUIDs are values in an array, never object keys in a Foundry update path. A player-owned Agent Actor is not trusted as the knowledge source. The GM chooses recipient World Agents when revealing information; “all Scene Agents” means distinct Agents with a Token in the Scene. Information remains known to the Agent across Scenes. Only the resolved Agent's known content enters the player's projection. The GM projection lists `always` and `situational` information together, marking the situational condition, and **Revelar** works for both. It also shows an approach's alternative DT and its condition beside the base DT; the player projection never contains the alternative DT, its condition or any sign that one exists, and `showDifficultyToPlayers` applies only to the base DT. Unknown information sends no content, condition, DT, specialization or placeholder row; known situational information appears as ordinary known content without its condition. Availability and knowledge are independent: a known information is not forgotten when its situation ends. **Examinar** remains available during an active run for each skill with a valid resolved Agent and may cost PD when it yields no new information.

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

Equipment is an implemented Item type with category, optional quantity and uses counter, and ordered use forms with stable IDs, names, descriptions, `consumesUse` and `mechanic: "standard" | "laboratory" | "radio"`. Missing mechanic means standard, without migration. Inventory keeps separate copies in saved order and permits manual quantity/uses adjustments. The mechanic selector remains visible in every category; runtime laboratory and radio execution require category tool.

Inventory and Investigation share selection and execution. No forms preserves legacy publication without payment; one form executes directly; several require a DialogV2 choice. Cancellation has no effects. Execution revalidates current Equipment, form, OWNER/GM permission and counter. Consumable forms require a valid counter with at least one use and pay exactly one; free forms remain available at zero. Quantity, PV and PD are never consumed. The publisher only renders the historical card, including the selected form.

Do not import category, load, weapon, armor, or modification assumptions from the previous Ordem system.

## Threats

Deferred.

No `threat` Actor type, threat Data Model, or threat sheet should be implemented until threat rules are published and reviewed.

## Combat

Deferred as a dedicated engine.

The early Agent model may expose resources and checks that are also useful during provisional combat, but no definitive initiative/attack/defense/damage architecture should be inferred from incomplete rules.

## Investigation

Investigation uses concrete World POIs, Scene participation and optional Region placement. The active Foundry Scene owns `flags.ordemparanormal2.investigationRuntime = {schemaVersion: 1, runId, round, actedAgentUuids, recapSuccessActorUuid?, shareSuccessActorUuid?}`. The GM starts and ends a run, can mark Agents manually, and advances rounds; a committed Examinar also marks its Agent as acted. Participants are distinct linked World `agent` Actors represented by Scene Tokens. Ending a run clears only its runtime, retaining knowledge, clues and provenance.

`pointOfInterestKnowledge` remains authoritative by Agent UUID and canonical information ID. Private `pointOfInterestDiscovery` entries add `{runId, actorUuid, informationId}` only for discoveries made during a run. The Scene references a GM-only World JournalEntry for narrative clues, each with generated ID, text, run ID and knowing Agent UUIDs. Player queries return only known clue text and sanitized POI data, never the raw JournalEntry.

After a confirmed Check, passive investigation compares the stored die step of the same skill or Aptidão specialization to base DTs and grants all newly reachable permanent information. `Examinar` then uses the existing Check snapshot, compares its resolved total to base DTs, and grants all remaining reachable permanent information; if the Check yields none, it reduces PD by one to a minimum of zero, even when the passive stage discovered information. The GM binds the Check Message to Scene, run, POI, Agent and skill before effects, allowing idempotent retry after partial failure. A cancelled Check or unavailable GM spends no PD. Situational conditions and difficulty overrides remain GM judgments; Reveal stays available for manual revelation. Critical state remains independent from DT success.

`Interagir` remains a private narrative request to the GM without a dedicated entry in the revised Player detail. `Recapitular` starts in the Scene panel header, requires GM approval followed by an Intuição DT 10 Check Request; success blocks further successful attempts globally for that run and lets the GM grant an existing current-run narrative clue or create one, immediately or later. `Compartilhar` starts from a known clue in the Scene list and transfers a clue discovered in the run to another participant before publishing one private Pesquisar DT 10 Check Request card. Success records the sender as the globally successful Agent and lets the GM grant another clue. Failure, refusal and cancellation do not lock either action. The Share card retains clue and result after a run ends.

### Investigation Application

The ApplicationV2 window has `itemUuid` identity. Opening the same POI from another Scene focuses that window and updates its `sceneId` access context. A left-click on a visible Region while Investigation Mode is on, or a click in the Scene panel, opens it. The existing Canvas gesture respects Token priority and does not intercept native drag or selection.

The screen uses the native window header, image and public description. The Player detail shows `Perícia | Ação | DT | Informações descobertas` with Examinar per skill and only known information; a skill with nothing known shows a dash. The Agent comes from one controlled Token or assigned character and must be an owned World Agent participating in the Scene. If resolution fails or is ambiguous, public data remains visible while personal knowledge and actions are unavailable. The GM sees the full `Perícia | Controle | DT | Pistas` table, per-information Reveal action, Agent known count and `gmContext` enriched with secrets enabled. Skill groups and rows derive from `information[].approaches[]` in saved order.

The Agent is resolved from one controlled Token or the assigned character, with OWNER permission and Scene participation; there is no Agent selector. That Agent drives known-information projection, tools and `performAgentCheck`; Aptidão offers only specializations present in SkillApproaches. Switching Agent invalidates the previous projection and pending responses. The GM reveal dialog accepts selected World Agents and offers all distinct Token-linked World Agents in the Scene. Knowledge writes are GM-authoritative, idempotent and stored on the POI Item.

The active-GM query validates Scene membership, global visibility, GM-controlled World Item, Agent type and OWNER permission from the authoritative requester context. It rechecks access after asynchronous description enrichment. The player payload contains only whitelisted name, image, public description, skill rows, public DTs, known content and known narrative clues. It excludes Item UUID, information IDs, unknown content, hidden DT values, private clue recipients and `gmContext`. The GM receives a separate complete view. The number of permanent information rows remains visible to authorized players; unknown situational rows are absent. An unavailable active GM produces an error without exposing content.

### Tool approaches and discoveries

`PointOfInterestApproach` is a union. SkillApproaches retain their original persisted shape, Aptidão, DT presentation and optional alternative DT. ToolApproaches store `{type: "tool", equipmentUuid, useFormId}` without DT, condition or consumption setting. Information may contain either branch or both. Duplicate skill/specialization or tool source/form identities within one Information are invalid; the same pair may occur across Informations. Native cleaning supplies legacy defaults only to SkillApproaches, without a World migration or preset revision change. Manually adding tools changes the importer's managed digest and uses its existing preserve/restore decision.

Canonical identity uses native compendium UUIDs and `_stats.compendiumSource` for derived copies. Independent World Items use their own UUID; embedded copies may recover a non-embedded World `_stats.duplicateSource`. New World Equipment drops pass an ephemeral native `clone({}, {keepId: true, addSource: true})` to the native handler. Compendium drops, embedded copies and sorting remain native. Names, images and bare IDs never infer origin. Legacy Equipment without recoverable provenance remains usable with manual interpretation. Renames preserve links; recreating a form with another ID requires explicit correction.

Investigation supplies explicit Scene/POI/run context. After valid use, the GM verifies current visibility, association, private control, participation and ownership, then matches the committed source and form against new `always` information. Deduplicated IDs are granted only to the using Agent. Knowledge and current-run Discovery are written together under the existing POI queue; without a run, only Knowledge is written. Tool usage never costs PD or marks the Agent as acted. Situational information remains manual. Stale context or no matching answer still permits normal Equipment use and requests manual interpretation.

Players see **FERRAMENTAS** below skills: every embedded tool in Inventory order, separate copies, optional current/max counter and **Usar**. Availability comes from its own forms/resources and busy state, never POI matching. Known information with SkillApproaches stays in the table; known tool-only information appears once under **DESCOBERTAS**, even after Equipment removal. The GM chooses Perícia/Ferramenta and validates source/form before replacing an approach. Unavailable references stay stored and visibly invalid. GM Investigation lists tool information with **Revelar**. Scene grouping uses the first SkillApproach or neutral **Informações descobertas**, without tool links.

Player DTOs include only minimal inventory and known content: no ToolApproaches, configured source UUIDs, unknown IDs/counts, private conditions or match flags. With an active GM, authenticated public User queries execute payment and contextual writes there. Per-Equipment queues also serialize manual uses adjustments; client windows share a busy lock. Session receipts bind operation IDs to parameters/context and retain completed stages for same-ID retries. A timeout never starts a local fallback. Ambiguous payment or changed authority requires manual review. No-GM usage remains local and authorized, with manual contextual interpretation. Equipment, chat and POI writes are separate Documents, without an atomic transaction or persisted journal.

### Portable laboratory

Laboratory ToolApproaches add optional `mechanicConfig: {type: "laboratory", sequenceLength: 4 | 5 | 6}`. SkillApproaches cannot contain it. The source/form identity is unchanged, and all bindings of one pair within a POI must agree. Absence denotes a standard interaction; a standard embedded form cannot reveal a laboratory-configured Information. A bound laboratory interaction requires compatible contextual configuration before payment; the no-binding manual fallback is described below. The catalog describes the reusable source's current mechanic, while runtime uses the current embedded form. Missing or incompatible references remain visible to the GM until explicit correction. Shared length edits require confirmation and replace every binding of that pair in one write. Configuration participates in managed import digests without changing presets or their revisions.

Laboratory requires Investigation and an active GM, including when selected from Inventory. Preparing and opening a session do not consume or publish. Starting revalidates the current form/resource and executes the normal Equipment use exactly once, paying one use only if `consumesUse`. The system source's `analyze` form is laboratory and free; existing copies remain standard until edited. No Equipment name triggers mechanics.

At start the GM freezes Mente and Exatas. A sequence has 4–6 independent dice starting at d4, following d6/d8/d10/d12 and repeating the Exatas ceiling. Initial rerolls equal numeric Mente / 2. Each selected position costs one, must be unique and in bounds, and replaces its previous result even when lower. Success means every result is at least its predecessor; equality is valid. Finalizing a broken sequence is failure even with rerolls remaining. Zero balance prevents reroll but does not auto-finalize. None of this uses Check totals, DT, criticals, RA/RB or the Check dice limit.

Only successful finalization grants frozen interaction IDs which still exist, are always available, retain the same binding/configuration and remain unknown. Newly authored targets are excluded. Knowledge stays isolated by Agent and uses existing current-run Discovery/sharing; without a run only Knowledge is written. Failure or cancellation grants nothing. Tool use never changes PD, PV, quantity or acted state.

Sessions and command receipts are temporary GM memory. Each command binds authenticated requester, session, command ID, expected revision and parameters. Retrying reuses IDs and completed stages, including individual Rolls in an incomplete reroll batch. Different operations cannot share one Equipment session; manual uses edits still enter the same queue without another payment. Closing before start is free; closing after start cancels without refund. Relevant permission, document, visibility, association, form/configuration or run changes invalidate an unfinished analysis. Parent Investigation close or Agent/context change requests cancellation and ignores late responses. A confirmed conclusion is not undone by close.

Investigation receives only safe session state and the terminal discovery count. Its existing status shows zero, one or multiple discoveries and refreshes skills, DESCOBERTAS, uses and Knowledge projections. Cancellation has no success message; partial analysis, publication or discovery failures retain their distinction. A single private result card snapshots the initiated analysis (including cancellation), native serialized Rolls and reroll history independently of later document edits. It contains no unknown information, private IDs or configured source and does not reconstruct lost sessions. Authority changes or restart require manual review. Laboratory manual validation was confirmed by the user; the original [LABORATORY_MANUAL_CHECKLIST.md](LABORATORY_MANUAL_CHECKLIST.md) remains available for regression checks.

For Laboratory and Radio, an authorized POI without any binding of the current canonical source/form pair allows a contextual manual use. It publishes the normal Equipment card and pays only the current form's usual use cost (the supplied `analyze`/`tune` forms are free), with no special challenge, Technology Check, special chat or Knowledge/Discovery grant. The safe result is `{newCount: 0, manual: true}`. Existing prepared/started sessions keep their original identity and invalidation behavior. A matching approach without required configuration, malformed data, a wrong configuration branch or conflicting configuration is an error, not absence. Retries retain the chosen manual route and confirmed executor stages even after later authoring. This fallback still requires Investigation and the active GM; it does not read a private POI on the player client.

In Investigation, a positive `newCount` takes precedence and uses the normal discovery feedback. Zero with `manual: true` uses the existing Equipment feedback: “Equipamento utilizado. A resposta contextual pode ser resolvida pelo mestre.” Zero with `manual: false` retains “Nenhuma informação nova foi descoberta.” Cancellation, partial failures and errors never become a success message.

When contextual matching completes, a zero-discovery result is manual only when an unknown compatible situational ToolApproach still needs the GM's judgment. Already-known automatic responses with no pending manual response return `manual: false`, including successful Laboratory/Radio challenges. Matching uses the canonical source, current form and compatible configuration, without interpreting condition text or using Item names. Receipts retain this zero-result decision during retries and partial conclusion recovery. The special unconfigured contextual fallback keeps its explicit manual result.

### Modified radio

Radio ToolApproaches use `mechanicConfig: {type: "radio", trueFragments: string[], falseFragments: string[]}`. True fragments are indivisible text pieces in correct message order. False fragments may be absent. Trimmed texts must be nonempty; repeated true texts are interchangeable, and false texts cannot equal a true text. One source/form pair has one equivalent configuration throughout each POI, potentially granting multiple Informations. Shared edits require explicit confirmation and an unchanged prior configuration signature. Native validation rejects mixed configuration branches and conflicting puzzles. No migration, name matching or automatic update of existing embedded copies occurs; only the source's existing free `tune` form opts in.

Radio requires Investigation and an active GM. Preparation has no effects. Cancelling the normal Technology Check Dialog is free; confirming starts the shared Equipment executor. The GM rebuilds current Actor dice, validates alternate attribute, transient steps, situational dice and current Ability references, rolls through the normal Check Engine, and confirms normal selected Ability costs. Radio itself never consumes quantity, PV or PD or marks an investigation round. The resolved Check total, including the three-highest rule for four dice, removes exactly 0 false pieces at totals <=6, `min(2, falseCount)` at 7–9, `min(3, falseCount)` at 10–12 and all at >=13. Crits, RA/RB and DT do not modify this table.

The GM samples false removals without replacement, creates opaque piece tokens and shuffles the remaining pieces once. Memory retains these exact results for retries and reconnects. Move exchanges adjacent active pieces; discard appends to the discarded list; restore appends to the message. Automatically removed false pieces never appear in the player DTO or restoration list. No intermediate correctness hints are returned. Finish accepts empty or incomplete submissions and succeeds only when every true piece and no false piece remains in the correct text order. Failure closes the attempt without displaying the solution. A new explicit use creates a new Check and attempt.

The public view contains names, state, revision, removal count and active/discarded opaque tokens and text. It never contains Check totals/results/snapshots, solution, classifications, configured source, removed texts, unknown Information IDs or remaining false counts. Preparation, commands, receipts, resume and terminal responses follow the same restriction. Normal Equipment and Check cards retain normal visibility; Technology respects the requester's current registered Foundry message mode, including blind and self rolls. An immediate removal notice and the puzzle conclusion are private to GM/OWNERS. The notice uses only the authoritative removal count and is published once before returning the puzzle, independently of Check visibility. The conclusion's immutable versioned snapshot records submitted composition, discards, removal count, outcome and grant count, without copying the Check or the private solution.

Radio has its own authoritative in-memory sessions and revisioned command receipts, sharing only the Equipment queue and explicitly composed Laboratory/Radio reservation guards. Human interaction does not hold the queue. Retrying reuses command IDs and confirmed payment, Check, shuffle, publication and grant stages. Relevant permission/context/form/source/configuration changes invalidate the session; renames do not, and Check inputs/results stay frozen. Closing the parent or changing Agent/context requests cancellation. Cancellation after start preserves consumption and costs; already-confirmed Knowledge is not undone. Ambiguous dice/payment or lost authority requires manual reconciliation, without client or chat reconstruction.

Success grants only frozen, still-compatible, unknown `always` targets through the existing joint Knowledge/Discovery writer. Without a run since preparation only Knowledge is written; a changed run invalidates the session. Situational Information remains manual. Investigation displays its existing 0/1/N discovery feedback and refreshes skills, DESCOBERTAS and uses only after a terminal result. Cancellation and partial failures keep their current distinct feedback. The user approved the main Radio smoke within Act II; advanced cases remain individually unconfirmed: [RADIO_MANUAL_CHECKLIST.md](RADIO_MANUAL_CHECKLIST.md).

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

The Investigation Application is keyed by World POI Item UUID and requests an audience-specific projection for the current Scene and resolved World Agent. Stored information and approach order, stable IDs and per-approach DT visibility stay on the Item; skill groups are derived. A player receives only sanitized public fields and known content; unknown information sends no row, count, ID, content or DT. The Scene panel groups known clues under their first SkillApproach or the neutral Informações descobertas group and includes known narrative clues; only current-run shareable known clues carry canonical references. The GM receives complete rows and `gmContext`. The Control window is GM-only and uses the Foundry Scene runtime. Shared feature CSS covers simple buttons, badges and section headers; window layouts remain specific. Investigation's small d6 button icon is its exact Figma asset; the Check Dialog's different die glyph CSS stays scoped to that dialog.

## Opposed Checks

An Opposed Check persists two canonical participant references, two requested `AgentCheckSelection` values, a minimal presentation snapshot and up to one `CheckSnapshotV3` per side. World Actors retain Actor UUIDs; unlinked Tokens retain Scene Token UUIDs and resolve through `token.actor`, never `baseActor`.

The requested label/context are historical creation-time presentation. A pending side displays that requested context. Once rolled, it displays the effective context reconstructed from the snapshot components, including an alternate attribute selected for that execution. The requested selections—not the effective alternate attribute—determine whether the title names one shared Check.

Comparison produces `pending`, `leftWon`, `rightWon` or `equalTotals`. `equalTotals` records only that both totals are numerically equal. The current public playtest does not specify how to choose a winner in that situation, so the system assigns no winner, trophy, damage, reroll or other consequence; RA, RB and critical state do not resolve it. The card describes it only as `RESULTADOS IGUAIS`.
