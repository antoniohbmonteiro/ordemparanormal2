# Adventure Scene import QA

The single **Importar para este Mundo** action materializes assets, imports handouts and Actors, then reconciles the basement Scene for each Act selected in the current run. The Act I revision deliberately omits the opened-furniture Tile: its authoring image is official artwork. The Act II revision contains the authored Walls, regular doors and Agent Tokens only, with no Regions, POIs or Tiles.

## Automated validation

Run focused Scene tests, type checking and the complete gate:

```powershell
npx vitest run src/core/adventure-import/adventure-scene-data.test.ts src/features/adventure-import/import-adventure-scenes.test.ts src/adapters/foundry/adventure-scenes.test.ts src/applications/adventure-import/adventure-import-application.test.ts
npm run typecheck
npm run check
```

Close Foundry before the production build to release generated LevelDB packs.

An optional native-schema test uses a locally installed Foundry v14 common module without database writes, copied Foundry source or distributed adventure artwork. Set the installation path appropriate for the machine:

```powershell
$env:FOUNDRY_V14_COMMON_PATH = 'C:\Program Files\Foundry Virtual Tabletop\resources\app\common\server.mjs'
npx vitest run src/adapters/foundry/adventure-scenes.native.test.ts
Remove-Item Env:FOUNDRY_V14_COMMON_PATH
```

The normal suite skips this one test when the environment variable is absent. Native model validation supplements mocks; it does not replace a live Canvas/permission smoke test.

## Foundry v14 smoke test

Use a disposable World and legally owned recognized PDF and ZIP sources.

1. Import Act II alone. Confirm exactly one **O Porão — Ato II** Scene in `A Maldição do Ídolo de Pedra > Ato II`, with one Level, 145 Walls, two regular doors, five linked Agent Tokens and no Tiles, Drawings or Regions. Confirm the Scene is not automatically activated.
2. In a fresh World, import Act I alone. Confirm only **O Porão** is created under `Ato I`, retaining one Level, 168 Walls, three control Tiles, five linked Tokens and three Drawing labels.
3. In another fresh World, import both Acts. Confirm exactly two imported Scenes, the corresponding Actor sets and one shared type-specific Folder tree; no Scene, Folder or Actor is duplicated.
4. Open both Scenes manually. Confirm each materialized map aligns with its authored Walls and placements, and Tokens use the imported Actors and semantic materialized images with PV/PD bars and vision.
5. In Act I, exercise the three GM-only control Tiles and confirm the existing two-door relationships remain unchanged. The bookshelf still has no opened-furniture visual.
6. In Act II, move Tokens and open/close both authored doors. Reimport and confirm positions and door states are preserved. Also confirm there is no Region/POI or Tile interaction.
7. Rename either imported Scene and add manual Tokens, Walls, Tiles, Drawings, lights, sounds and Regions. Reimport: retain the name and every manual document. A manual homonymous Scene remains independent.
8. Change managed Wall geometry or Token presentation; delete a managed Token. Reimport and test **Preservar**, **Restaurar dados importados** and dialog cancellation. Restore only managed configuration, recreate missing managed documents with stable IDs, retain manual content and current state, and show one Scene/lote decision.
9. Temporarily make a required map, Token asset or imported Actor unavailable while both Acts are selected. Reimport: the Scene-stage preflight fails before any Scene write; previous assets, handouts and Actors remain. Restore the missing source before retrying.
10. Delete either imported Scene and rerun twice: recreate it once with stable embedded IDs. Exercise interruption/failure recovery and active-GM changes; incomplete provenance must retain the same identity and stale plans must not overwrite newer edits.
11. Move each imported Scene to another Folder and rerun. Confirm custom placement is preserved. In a separate legacy Act I fixture, remove its placement marker and Folder while retaining valid revision-one provenance; confirm it moves once to the managed Act I Folder without changing divergence or runtime state.

Manual Regions/POIs added later are preserved but are not authored, associated or reconciled by this feature. The importer may reconcile the name, color and provenance of its own Folder, but never treats manual contents as imported. Playlists and Scenes beyond the two declared presets remain outside this test.
