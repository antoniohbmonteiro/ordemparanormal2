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

POI canvas presentation is transient. Region documents own composed geometry and Level eligibility (`viewed`); Items own reusable content. The system-owned canvas renderer uses the public polygon tree for drawing and two-dimensional hit testing, independently of RegionLayer activation or Placeables. Investigation Mode is client-local, initially OFF, and survives Scene, Level and control changes until reload. OFF hides all owned visuals and pauses their ticker; ON shows the highlight, hover and label independently of active Scene Controls, including Tokens. Geometry and Level reconciliation continue while hidden. The control group is displayed as Investigação: its first toggle and the remappable I keybinding share this local state. Players receive only the toggle, with no selectable authoring tool or RegionLayer binding. GM authoring tools retain their existing drawing behavior. Level changes reconcile eligible Regions, while ordinary pan/zoom reuses geometry and graphics.

**The same renderer/session runs for both roles**, filtering which `PoiRegionView` enter the session: the GM gets every associated, viewed POI regardless of reveal and its label is resolved live from the Item; a player gets only POIs where `isPoiRevealedTo(reveal, userId, false)` is true and the label comes **only** from the safe `pointOfInterest.name` snapshot (below) — a player client never resolves the `pointOfInterest` Item. The `updateRegion` hook reconciles eligibility incrementally: a reveal or association change makes a POI appear or disappear on each player's canvas with no reload, and a change to just the name snapshot updates the player's label without rebuilding geometry. A revealed POI with no snapshot name shows a neutral fallback label. Canvas right-click POI management stays GM-only. No selection persistence is introduced.

Native `name` and `img` are not duplicated in `system`. `PointOfInterestDataModel` stores:

```text
publicDescription           rich text (ProseMirror / HTML)
gmContext                    rich text (ProseMirror / HTML), GM-private authoring content
skills[]
├── skill                    canonical SkillKey, unique within the POI
└── information[]            one or more entries
    ├── id                   stable identity (Foundry randomID), generated once on creation
    ├── difficulty           integer ≥ 1, no upper bound (mirrors resolveCheckDifficulty)
    ├── content              plain multi-line string
    └── showDifficultyToPlayers boolean, initial false
```

`publicDescription` and `gmContext` are declared in `system.json` as `htmlFields`. A POI may have zero or more skill groups, every group has at least one information entry, and a `SkillKey` may occur only once in the POI. The DataModel rejects empty groups, duplicate skills, and duplicate information ids. The defensive reader accepts only this grouped shape and never reads or converts the removed flat `system.information[]` shape. Entry `id`s are stable across edit and removal and identify revealed information in separate placement state. There is no execution state on the Item and no migration for the development-only flat shape.

The Point of Interest ItemSheet is a GM authoring tool. Its `_prepareContext` withholds `gmContext` and `skills` from the non-GM render context and shows a GM-tool notice instead. This is a **presentation** boundary, not secure transport: POIs stay GM-only-owned in this step, and a client granted Item access can still inspect `item.system`. The player-facing Investigation Application receives a separate sanitized projection — never the raw Item. See the "Investigation" section below and `docs/PLAYTEST_FEATURE_NOTES.md` §5.

### Region association

Foundry Regions own canvas geometry, including ordered Shapes and holes. A Region may explicitly reference one reusable POI Item through:

```text
flags.ordemparanormal2.pointOfInterest = { itemUuid: string, name?: string }
```

The UUID comes from a non-embedded world or compendium Item of type `pointOfInterest`. `name` is a **safe display-name snapshot** written by the GM's picker (which already resolves it) — it is the POI's name only, never a projection of `system`, `gmContext`, `information` or `publicDescription`. It exists so the player renderer can label a revealed POI without resolving the Item at all. It can go stale if the Item is renamed after association; the GM refreshes it by re-selecting the POI in RegionConfig. Legacy associations without `name` render a neutral fallback label for players. No Item image or geometry is copied into this flag. Several Regions may reference the same Item. A structurally valid reference remains an association when its Item is unavailable; resolution is separate and opening a sheet never repairs or deletes flags automatically.

GM association editing lives in the native RegionConfig. Choosing, replacing and removing affect a local sheet draft; the native Update Region submit persists the draft alongside the other form fields. Closing discards it. The form uses public `FormDataExtended.set` and `ForcedReplacement`/`ForcedDeletion` operators at this flag key only, preserving sibling flags and namespaces. Rerenders preserve pending drafts; closing also closes the picker and invalidates delayed results. Only canonical persisted Region documents receive the section; palette and preview documents do not.

### Region reveal

A Region that has a POI association also carries per-placement player visibility, in a **separate** flag so association writes and reveal writes never clobber each other:

```text
flags.ordemparanormal2.pointOfInterestReveal = {
  mode: "hidden" | "everyone" | "users",   // absent flag ⇒ hidden
  users: string[],                         // User ids, meaningful only when mode === "users"
  notified: string[]                       // User ids already whispered at least once
}
```

The defensive reader collapses a missing value or unknown `mode` to fully hidden and drops blank/duplicate ids. Writes replace the whole object through `ForcedReplacement` at this key only. Authorization is pure (`isPoiRevealedTo`): the GM is always authorized; `everyone` authorizes every player; `users` authorizes the listed ids; `hidden` authorizes none. The player canvas renderer uses this predicate to decide which POIs enter that client's session (see the canvas section above); `updateRegion` reconciles it in runtime.

The GM manages visibility directly on the canvas: with the "Investigação" control group open and the `selectPoi` tool active, right-clicking inside an associated POI opens a small actions menu (POI name plus Abrir POI / Mostrar para todos / Mostrar para… / Ocultar). "Mostrar para…" opens a small DialogV2 listing player Users, pre-checked from `reveal.users` when the mode is `users`. The right-click is intercepted (and the native context menu suppressed) only under those exact conditions and only when the existing POI hit-test actually lands on an associated POI; otherwise Foundry's native interaction is untouched. The menu never activates the RegionLayer, selects the Region, or reads Foundry-internal DOM. Applying is immediate (`region.update`) and is the authoritative operation — the only one that can report failure. The RegionConfig keeps only the association fieldset; it has no reveal UI.

When a user gains access for the first time (an authorized id not in `notified`), the system whispers one generic private chat message per newly-revealed user ("algo novo chamou sua atenção nesta cena"), carrying no POI identity, scene name or geometry. `notified` is written together with the reveal, so the whisper is **at-most-once**: hiding sends nothing, and updates that do not newly authorize anyone send nothing. The whisper is a **best-effort** side effect: a `ChatMessage.create` failure is logged, not surfaced, and not retried — so a user may, exceptionally, be revealed without receiving the message if chat fails.

**Visibility trade-off (accepted).** The POI visibility state and the `name` snapshot live on Region flags, which Foundry replicates to player clients in full. A technical player can inspect `mode` / `users` / `notified` and the POI name via console, and could force their client to render a POI meant to be hidden — but the flags carry no POI content. Private content is served only through the GM-authorized Investigation projection. The separate information-reveal flag likewise exposes only association UUID and opaque ids, as detailed below.

The POI Scene Controls enable native Rectangle, Ellipse and Polygon drawing through the RegionLayer. Drawing produces ordinary Regions with no automatic association. Existing controlled Regions are released before drawing. An open or rendering RegionConfig blocks drawing with a warning; opening one during drawing returns to `selectPoi`. The other three modes remain passive. There is no creation correlation, custom renderer or migration in this slice; execution state is limited to manual information reveal.

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

The reusable **Point of Interest Item** (`pointOfInterest`, see above) remains a GM-authored content definition. Manual shared information reveal now exists as placement state. Player-facing `Examinar` delegates to the existing Agent Check workflow without supplying a POI DT or automating reveal; Investigar/Interagir/Recapitular/Compartilhar, PD consequences and discovery automation remain future work.

### Investigation Application

A left-click on a POI, **only while Investigation Mode is ON**, opens a minimal `ApplicationV2` — the base of the future Investigation Application. It is opened from the **placement**, so its identity is `sceneId + regionId` (one instance per placement; a second open just focuses the existing window). Future per-placement investigation execution state belongs here, not on the Item.

The click is a pure gesture observer on the canvas view: `pointerdown`/`pointerup` within `CLICK_SLOP` px, over the same POI (reusing the existing PolygonTree hit-test and overlap priority), left button only. It never calls `preventDefault`/`stopPropagation`, so native Token selection and drag are untouched and a drag never opens the window. **A Token keeps priority over the POI**: if a visible Token sits under the gesture start or end (checked with public API only — `canvas.canvasCoordinatesFromClient`, `canvas.tokens.placeables`, `token.visible`, `token.bounds`), the click is left to the Token and the window does not open. GM and player both get the click; the reveal context menu stays GM-only.

The screen shows the native Foundry header, POI image, `name`, `publicDescription` (enriched with `secrets: false`) and a four-column `Perícia | Ação | DT | Informação` grid whose final column takes the remaining width. Each skill is one visual block in canonical `SKILL_KEYS` order, with one aligned row per `information[]` entry. For a player, Perícia and Ação read as group-spanning cells, `Examinar` appears once per skill and starts the existing Agent Check flow, and each information row contains either its public DT or only a hidden-DT marker. `Outra perícia...` appears after the grid, disabled. For a GM, Perícia spans the group visually while Ação stays per-information with `Revelar` or `Revelada` per row; every real DT and information content is visible, and enriched `gmContext` appears in a separate `Somente o Mestre` panel. The GM variant has no `Examinar` or `Outra perícia...`.

**Security — the projection.** The player client never resolves the Item. The sanitized `PoiInvestigationViewData` is built GM-side and delivered via the public v14 query API: the player calls `game.users.activeGM.query("ordemparanormal2.poiInvestigation", { sceneId, regionId })`; the handler receives `(data, { user })` where `user` is the **server-authoritative** requesting User (Foundry 14.367 `Users.#handleUserQuery` resolves it from the socket, not from the payload), re-checks `isPoiRevealedTo(reveal, user.id, false)` **before** touching the Item, and returns only whitelisted presentation fields. Association and reveal authorization are checked again after asynchronous Item resolution and description enrichment. A GM resolves locally without a query. No GM online → the window shows an error; nothing breaks. The reveal re-check here is a real authorization boundary, not merely UX.

The player projection contains `audience: "player"`, name, enriched description, the safe `Item.img` path and skill groups whose information entries are discriminated as either `{visibility: "public", difficulty}` or `{visibility: "hidden"}`. A revealed row additionally receives only its `content`; unrevealed rows omit it. It never contains `gmContext`, information ids, hidden difficulty values, Item UUID, raw Item data or unrevealed content. This deliberately exposes the number of configured information entries per skill. A GM receives a separate full local projection with association UUID, information ids/reveal state, real DTs, all information content and enriched `gmContext`; the authoritative requester role determines which projection is built.

**Information reveal state.** The Region flag `pointOfInterestInformationReveal` stores only `{itemUuid, informationIds}`. Its association UUID binds the state to the current Item; a mismatch reads as empty, so reused information ids cannot carry reveal into a reassociated POI. The flag is replicated and therefore exposes opaque random ids, reveal count/timing, and possible same-Item cross-placement correlation, but never content or hidden DT values. A GM-local, permission-backed Region update performs the mutation after revalidating Scene, Region, association, Item type/UUID and information membership. The replicated `updateRegion` is only an invalidation signal: open clients query the sanitized view again instead of receiving content in an event payload.

Potential investigation **execution** state (which information a given investigation has revealed, per Actor/scene) should be evaluated separately as scene/region/application state when that feature is planned. It must reference stable information ids, and it must not live on the POI Item.

## Source-of-truth rule

Whenever the playtest changes:

1. update this document first if the domain assumption changed;
2. identify schema impact;
3. prefer migrations only for data that was actually persisted in a released version;
4. avoid compatibility code for internal prototypes that never shipped.

The `0.0.7` transition intentionally removes the development-only `system.profile` and `system.resources.impetus` fields without migration. Existing development Actors may be recreated or reconfigured manually.

The `0.0.8` transition relies on the `abilityGrants: []` field default for existing Profiles. Existing Abilities are never inferred, marked, or adopted by name.

The Occupation transition is versioned independently in a hidden world setting whose default is `0`. Migration 1 creates a local embedded Occupation from each non-empty legacy string before clearing that string. Conflicting pre-existing data is preserved and never resolved by name.

### Investigation presentation

The Investigation Application retains its Scene + Region identity and requests a GM-authorized, audience-discriminated projection. Every structurally valid group in `system.skills[]` exists in persisted insertion order, and every information entry produces an aligned visual row. There is no active distinction between existing, listed, suggested or hidden skills. Each information entry independently owns `showDifficultyToPlayers` (initial false). Information IDs, difficulties and content remain intact on the Item.

The player projection contains only name, enriched public description (`secrets: false`), image path, sanitized per-information rows and content for rows already revealed on that placement. No information IDs, hidden DT values, unrevealed content, `gmContext`, Item UUID or raw Item system are delivered. Its row count intentionally discloses the number of information entries per skill. The GM-only local projection contains complete DT/content rows, reveal state and `gmContext` enriched with secrets enabled. Access and association are checked again after asynchronous resolution. Image rendering needs only the path, not Item ownership; unavailable images show a neutral fallback.

`Examinar` resolves exactly one rollable controlled Agent, falling back to `game.user.character`, then calls the existing `performAgentCheck`. Normal POI skills map to the corresponding skill selection; Aptidão requires an explicit choice from its canonical specializations. The Investigation Application never constructs a Check input, supplies a POI DT, compares results, spends PD or reveals information automatically. `Outra perícia` remains unavailable. Future discovery state belongs to the placement and association, never the canonical Item. Private per-player IDs/content must not be stored in replicated Region flags; restricted GM storage and shared/individual semantics remain a separate delivery.
