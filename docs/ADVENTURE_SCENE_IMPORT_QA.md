# Adventure Scene import QA

The single **Importar para este Mundo** action materializes assets, imports handouts and Actors, then reconciles the Act I basement. Revision 1 deliberately omits the opened-furniture Tile: its authoring image is official Act II artwork. The bookshelf still controls its two doors, with no Tile reference and no Act II ZIP dependency.

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

Use a disposable World and legally owned recognized PDF/Act I ZIP sources.

1. Import through the existing button. Confirm exactly one imported basement Scene, one Level, 168 Walls, three control Tiles, five linked Agent Tokens and three Drawing labels. The Scene is not automatically activated or assigned an authoring folder.
2. Open it manually. Confirm the full map aligns with Walls and placements; Tokens use the imported Actors and materialized images, with PV/PD bars and vision. Test hover/focus, dialog resizing/scrolling and native window controls.
3. As GM, click each of the two air-passage controls and the bookshelf control outside the Tiles editing layer. Each changes its corresponding two doors. The bookshelf has no opened-furniture visual in this revision. As a player, confirm GM-only control authorization remains enforced.
4. Move a Token, open/lock a door and hide a control Tile. Reimport without configuration changes: no duplicate Scene/documents and no reset of gameplay state or fog exploration.
5. Rename the imported Scene and add manual Tokens, Walls, Tiles, Drawings, lights and sounds. Reimport: retain the name and every manual document. A manual Scene also named **O Porão** must remain independent.
6. Change managed Wall geometry or Token presentation; delete a managed Token. Reimport and test **Preservar**, **Restaurar dados importados** and dialog cancellation. Restore only managed configuration, recreate missing managed documents with stable IDs, retain manual content and current state, and show one Scene/lote decision.
7. Temporarily make a required asset or imported Actor unavailable. Reimport: the Scene-stage preflight fails with no Scene write; previous assets/handouts/Actors remain. Restore the missing source before retrying.
8. In the disposable World, delete the imported Scene and rerun twice: recreate it once. Confirm imports of Act II alone never create a Scene or add Tokens elsewhere.
9. Exercise interruption/failure recovery and active-GM changes: incomplete provenance is retained, rerun uses the same identity, and stale plans cannot silently overwrite newer managed edits.

Manual Regions/POIs added later are preserved but are not authored, associated or reconciled by this feature. No global folder/color changes, playlists or additional Scenes belong to this test.
