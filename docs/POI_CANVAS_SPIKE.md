# POI canvas feasibility spike

Branch: `spike/poi-canvas-feasibility`. This is a disposable GM-only experiment, not the investigation feature or a released persistence contract.

## Findings and evidence

The reusable `pointOfInterest` Item already exists in source, the manifest and the domain documentation. It remains unchanged. The Item list in `AGENTS.md` and the architecture document's opening status are older than that implementation. Registration still enters through `src/main.ts` in `Hooks.once("init")`, delegating hook wiring to `bootstrap/`.

The spike adds a GM Scene Controls group. Its button chooses the first world POI Item and calls the public `canvas.regions.placeRegion` API with a concave L-shaped polygon. The native placement preview accepts a position and rotation; creation passes `renderSheet: false`. It stores only `flags.ordemparanormal2.poiCanvasSpike.itemUuid`, taken from the Item's canonical `uuid`. The reader also accepts canonical compendium Item UUIDs, although this disposable button only selects world Items.

The renderer owns one non-interactive PIXI container in `canvas.interface`. Each marked Region contributes its resolved `RegionDocument.polygons` for outlines and `polygonTree.testPoint` for hover. This preserves concavity, disconnected boundaries and hole boundaries without using the bounding box as geometry. Pointer events come from the public PIXI application's canvas element (`canvas.app.view`), with public `canvasCoordinatesFromClient` conversion; there is no query against Foundry's HTML structure. No clicks are intercepted. The native Region layer may be inactive.

Scene coordinates inherit the interface group's transform. `canvasPan` schedules a hover refresh even for a stationary pointer. `canvasReady` rebuilds from persisted Region flags; document create/update/delete hooks synchronize committed changes. `canvasTearDown` removes listeners, cancels queued work and destroys owned graphics/container. Repeated ready and cleanup calls are covered. Hook registrations live for the client session; the registration function also returns a disposer that removes them all. No polling loop, Tile, custom Document, socket, class replacement, migration, investigation state, rule or Item content is introduced.

### Technical matrix

**PASS here means a documented public API and passing local boundary tests, not observed Foundry runtime acceptance.** The tests use real PIXI containers, transforms and polygons, with recording graphics and minimal Foundry shims. They do not run the Foundry Region implementation, its native placement interaction, WebGL or networking.

| Requirement | Technical result | Evidence / remaining runtime check |
| --- | --- | --- |
| Scene Controls | PASS | Public hook and control record; GM guard tested. Inspect actual sidebar button. |
| Region placement | PASS | Public `placeRegion` call, cancellation/concurrency/error guard and no-sheet option tested. Confirm native placement and Esc in v14. |
| Region metadata | PASS | Canonical UUID, flag structure and defensive reader tested. Confirm database persistence/reload. |
| Region geometry | PASS | Resolved polygons forwarded; concavity and hole containment tested with PIXI fixtures. Compare actual Region output. |
| Canvas rendering | PASS | Public group/container attachment and geometry submission tested. Visual/WebGL acceptance pending. |
| Hover interaction | PASS | Pointer enter/exit, hole and concavity tested independently of any native active layer. Check real canvas/UI and tokens. |
| Pan / zoom | PASS | Real PIXI transforms and stationary-pointer refresh tested. Check Foundry camera integration. |
| Region updates | PASS | Replacement of geometry, removal of metadata, deletion and other-Scene isolation tested. Check native editing/movement. |
| Scene lifecycle | PASS | Ready, repeated ready, teardown, rebuild and disposer tested. Check actual Scene switch, reload and interrupted placement. |
| Public API only | PASS | All Foundry entry points reviewed against public v14 documentation; no internal method calls or core subclass overrides. |

**Runtime evidence updated after user smoke:** the user confirmed creation, resize, overlay, hover and basic Region editing. Multiple Shapes, holes and shape ordering were explicitly not established by that smoke. No connected Foundry browser session is available to this task for the extension; its new runtime checks remain pending. The original matrix describes local technical evidence, not blanket runtime acceptance.

## Decision for the future Plan

1. **Recommend Item → Region → custom renderer?** Yes, as the candidate supported by the public API and this implementation. Keep runtime acceptance conditional on the smoke test. Region is placement/geometry; Item remains reusable authoring content. This spike establishes no investigation execution schema.
2. **Where should the renderer live?** A dedicated container inside `canvas.interface` is sufficient for this experiment: it inherits camera transforms, stays independent of active editing layers and can be disposed by public canvas hooks. `canvas.overlay` is unsuitable for these world-coordinate outlines because it is not bound to the stage transform. A registered `CanvasLayer` would be reasonable if future complexity needs Foundry-managed drawing/teardown, but adds no needed behavior here. `InteractionLayer` is unnecessary for passive hover and would introduce activation semantics unrelated to this renderer.
3. **Largest technical risk?** Player visibility and distribution. The interface is above map effects; it does not automatically supply the future POI fog/vision/discovery policy. Region flags and native visibility settings must not be assumed to protect undiscovered information. There is no secret content in the flag, and this renderer never resolves the Item or reads `gmContext`/`information`. Define a sanitized player projection and visibility policy before player-facing work. Native placement cancellation during a Scene switch is another runtime check still outstanding.
4. **Keep:** canonical Item UUID references, narrow placement identification, reading resolved Region geometry instead of reconstructing shapes, no-click hover approach and explicit lifecycle/disposal tests. Keep these responsibilities; reassess the disposable flag name before shipping.
5. **Discard:** the first-world-Item selection, fixed 300px L polygon, spike-only flag contract and group, hardcoded test messages/colors, and direct unconditional bootstrap activation. The diagnostic outline and recording graphics tests are not final glow or visual acceptance tests. No migration is required for disposable spike data.
6. **Premises to adjust before the Plan:** native `placeRegion` positions supplied shapes; this spike does **not** prove freehand polygon authoring through a custom POI tool. Decide whether positioning a supplied shape is sufficient or whether a separate drawing experiment is required. Region geometry is usable, but it is not a privacy boundary. Do not assume the GM's interface overlay can simply be enabled for players. Resolve level/elevation, overlap and vision behavior when their concrete UX is planned. The spike filters explicitly level-bound Regions and is a 2D hover experiment, not elevation-aware investigation.

Committed Region geometry updates are supported; native drag previews are not mirrored while the mouse is held. The updated outline is expected after dropping/saving. Source Item deletion leaves a dangling placement UUID for inspection; no reconciliation policy is invented here.

## Validation

The default Node was `24.14.0`, below `package.json`'s `>=24.14.1`. Validation used the available bundled Node `24.19.0` without changing package requirements:

```powershell
$env:PATH = 'C:\Users\Antonio\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin;' + $env:PATH
npm test -- src/adapters/foundry/poi-canvas-spike/poi-canvas-spike.test.ts
npm run check
```

Initial spike validation: **11 focused tests**, **86 test files / 648 tests** in the full gate. See the extension results below for the latest run. `npm run check` runs the requested `npm run typecheck`, `npm test` and `npm run build`. Existing packs are regenerated by the normal build script; pack sources are unchanged. `dist/` and generated packs remain ignored.

## Original manual Foundry v14 smoke test — partially confirmed by user

Use a disposable local world with this branch's built system. Install/copy the repository's system runtime layout into `{Foundry User Data}/Data/systems/ordemparanormal2`, including `system.json`, `dist`, `lang`, `styles`, `templates`, `assets` and `packs` as described by the repository's installation layout. If the development installation already points at this checkout, rebuild and reload. Use a Scene with a background or grid and sufficient room for a 300px polygon. Record the actual Foundry build number and browser used.

1. Log in as GM. Create one world Item of type **Ponto de Interesse**. Open a Scene. Confirm the new **Pontos de Interesse (spike)** group appears. Click its **Colocar POI de teste** button, position the L polygon and confirm with left click. The Region configuration sheet must not open. Repeat and cancel with Esc; no new Region should remain. Rapidly click the button twice; only one placement session should run.
2. In the browser console, find the test placement and inspect only its source reference:

   ```js
   const poiRegion = canvas.scene.regions.find(r => r.getFlag("ordemparanormal2", "poiCanvasSpike"));
   console.log(poiRegion.uuid, poiRegion.getFlag("ordemparanormal2", "poiCanvasSpike"));
   const poiSource = await fromUuid(poiRegion.getFlag("ordemparanormal2", "poiCanvasSpike").itemUuid);
   console.assert(poiSource.type === "pointOfInterest");
   console.log(poiRegion.shapes, poiRegion.polygons);
   ```

3. Switch to the native Token controls. The cyan L outline must remain aligned. Move into either solid arm: it becomes thick yellow. Move into the missing lower-right corner of its bounding box: it must remain cyan. Leave the canvas for the sidebar or a window: the highlight must clear. Token selection, token dragging and right-drag panning must still work. No POI post-click UI exists.
4. Pan repeatedly; zoom in/out with the pointer inside and outside the L. Verify both placement and hover. With the pointer stationary, change the camera through `canvas.pan(...)` or `canvas.animatePan(...)`; hover must follow the area now under the pointer. Repeat with the browser resized.
5. Use native Region controls **only for editing QA**, select the test Region and move/rotate it. After committing the edit, the old outline must disappear and the new outline must match. Through native Region shape editing, add a hole and another separated shape. Test cyan/yellow transitions in the hole, exterior and second shape. Alternatively, replace the disposable test Region shapes with deterministic fixture data:

   ```js
   await poiRegion.update({shapes: [
     {type: "polygon", points: [500,500,800,500,800,600,600,600,600,800,500,800], hole: false},
     {type: "polygon", points: [520,520,560,520,560,560,520,560], hole: true},
     {type: "ellipse", x: 1000, y: 650, radiusX: 120, radiusY: 60, rotation: 30, hole: false}
   ]});
   ```

   Compare the rotated ellipse and hole outlines with the native Region display, then switch back to Tokens and repeat hover. This specifically checks Foundry's actual resolved geometry, which local fixtures cannot certify.
6. Create a second placement; delete **that disposable placement** through native Region controls and verify only its overlay disappears. Update a Region in another Scene and verify the viewed Scene stays unchanged. Remove the spike flag from one disposable placement using `unsetFlag("ordemparanormal2", "poiCanvasSpike")`; its custom outline must disappear without deleting the Region.
7. Switch to another Scene and back, redraw the current Scene and reload the browser. Saved test placements must return exactly once; no old Scene outline should remain. For redraw diagnostics:

   ```js
   const oldPoiContainer = canvas.interface.children.find(c => c.name === "ordemparanormal2-poi-canvas-spike");
   await canvas.draw();
   console.assert(oldPoiContainer.destroyed);
   console.assert(canvas.interface.children.filter(c => c.name === "ordemparanormal2-poi-canvas-spike").length === 1);
   ```

8. Begin placement, then switch Scenes before confirming. Verify native preview cancellation, no placement in the wrong Scene and the ability to start another placement afterward. Repeat scene switches/redraws ten times; inspect DevTools memory/event-listener diagnostics for retained old containers or growing canvas pointer listeners. There should be one owned `pointermove` and one `pointerleave` registration for the current renderer, removed on teardown.
9. Test a Scene with multiple levels, if available: a placement bound to one level must not appear on another. Switch back and check exactly one overlay. Test canvas disabled/no viewed Scene: no new placement or error. Log in as a player: no spike group or custom overlay, and no access to POI authoring content should be granted by the spike. This does not certify transport secrecy for a future player feature.
10. Remove only the disposable Regions created by this test. Do not remove unrelated Regions or Items. Verify cleanup, then remove the bootstrap call/import and spike files when discarding the experiment. No automatic commit, push, version bump or release is part of this task.

## Public API references

Reviewed against the current public v14 documentation (footer: 14.365 Stable); repository typings are `@dfreds/foundry-types` 14.366.1. Some declarations lag the web API, so the implementation uses common public members and small local type assertions for omitted globals/hook overloads.

- [Scene Controls hook](https://foundryvtt.com/api/v14/functions/hookEvents.getSceneControlButtons.html) and [SceneControl record](https://foundryvtt.com/api/v14/interfaces/foundry.SceneControl.html).
- [RegionLayer.placeRegion](https://foundryvtt.com/api/v14/classes/foundry.canvas.layers.RegionLayer.html#placeRegion) and [placement options](https://foundryvtt.com/api/v14/interfaces/foundry.canvas.layers.types.RegionPlacementOptions.html).
- [RegionDocument geometry and flags](https://foundryvtt.com/api/v14/classes/foundry.documents.RegionDocument.html) and [PolygonTree containment](https://foundryvtt.com/api/v14/classes/foundry.data.PolygonTree.html#testPoint).
- [Canvas groups and coordinate conversion](https://foundryvtt.com/api/v14/classes/foundry.canvas.Canvas.html), [InterfaceCanvasGroup](https://foundryvtt.com/api/v14/classes/foundry.canvas.groups.InterfaceCanvasGroup.html) and [CanvasLayer extension points](https://foundryvtt.com/api/v14/classes/foundry.canvas.layers.CanvasLayer.html).
- [canvasTearDown](https://foundryvtt.com/api/v14/functions/hookEvents.canvasTearDown.html) and [canvasPan](https://foundryvtt.com/api/v14/functions/hookEvents.canvasPan.html).

`registerMouseMoveHandler` was considered but its public documentation exposes no matching unregister operation. Removable listeners on the public PIXI view keep ownership and teardown explicit for this disposable experiment.

## Extension: multiple Shapes and holes on one POI Region

### Public API finding

These are three different operations:

| Operation | Persisted effect | Identity |
| --- | --- | --- |
| Create a second Region | `placeRegion(data, {create: true})` creates another Scene Region document | New Region ID/UUID, flags and overlay |
| Add a positive Shape | `existingRegion.update({shapes: [...existingShapes, positiveShape]})` extends its ordered shape list | Same Region ID/UUID, Item reference and one overlay |
| Add a hole | The same update, appending a Shape with `hole: true` | Same Region; subtractive geometry, not a separate Region |

Shapes are inner data models in an ordered array, not embedded Documents with their own document UUIDs. Consequently, use the Region's public `update` with serialized shape data, rather than `createEmbeddedDocuments("Shape", ...)` or direct mutation of `region.shapes`.

The v14 [placement option `create: false`](https://foundryvtt.com/api/v14/interfaces/foundry.canvas.layers.types.RegionPlacementOptions.html#create) returns a positioned preview document without persisting a new Region. The extension takes its `toObject().shapes[0]` and appends/replaces a shape through [RegionDocument.update](https://foundryvtt.com/api/v14/classes/foundry.documents.RegionDocument.html#update). No Region Configuration is opened. This composes two public APIs; it does not call an undocumented native “add Shape” handler. No public dedicated begin-add-hole editing session was identified in the RegionLayer API.

For hole placement, the cursor preview is deliberately positive so it has visible geometry. Its positioned coordinates are copied with `hole: true` only into the target Region. A lone negative shape has no positive area to display. The positive preview is never persisted.

**Order is semantic:** a hole removes area from preceding positive Shapes; a later positive Shape can fill the same area again. Reordering the hole before the positive Shapes can therefore make the former hole hoverable, correctly. A hole outside all preceding positive geometry removes nothing. This follows the [official Scene Regions guide](https://foundryvtt.com/article/scene-regions/). The renderer must consume the final `polygons` and `polygonTree.testPoint`, not union every positive Shape and subtract every hole regardless of order.

### Temporary controls

The existing spike group now includes:

- **Adicionar Shape ao POI:** position an 80px-radius positive circle and append it to the existing target.
- **Adicionar hole ao POI:** position a 20px-radius circle and append it with `hole: true`.
- **Reposicionar última Shape do POI:** replace the last entry with its newly positioned geometry, preserving its positive/negative role and shape count.
- **Remover última Shape do POI:** remove only the last entry; leave the final remaining entry intact so the experiment can continue.
- **Mover última Shape do POI para o início:** reorder the actual array, including any hole, with no additional document or preview.

Target selection is deliberately temporary: use the single controlled marked POI Region, or the sole marked POI Region in the Scene if none is selected. Multiple selected POIs or an ambiguous fallback produce a notice. Native Region selection is allowed for choosing the target; its Configuration sheet is unnecessary. The target is captured before starting the preview, so changing selection during placement does not retarget the operation.

Creation and shape operations share the same local in-flight guard. Esc/skipping a preview does not update the target. Before committing a positioned shape, the adapter rechecks GM permission, current Scene, target existence/POI reference and the original serialized shape array. A changed/deleted/unmarked target or concurrent shape edit causes the operation to abort. This is a local stale-edit safeguard, not atomic multiplayer conflict resolution for production.

No renderer geometry rewrite was needed. `updateRegion` already replaces the one owned graphic using freshly resolved geometry and reevaluates hover at the stationary pointer. Graphics now carry the diagnostic name `poi-region-<regionId>` to distinguish one multi-shape overlay from several Region overlays. No shape runtime state is saved on the POI Item.

### Evidence and limits

| Extension requirement | Result |
| --- | --- |
| One POI Region with multiple Shapes | Public data contract and same-document update verified by tests; actual composition probe below pending |
| Append a positive Shape | Implemented through non-persisted placement preview + target update; tests pass |
| Append `hole: true` | Implemented, preserving positive preview and negative persisted role; tests pass |
| Resulting geometry, including hole | Renderer forwards resolved boundaries; integration fixtures pass; actual Foundry boolean composition pending |
| No hover inside an effective hole | Local boundary tests pass; runtime probe checks native containment; visual smoke pending |
| Update/remove/reorder reflected | Array operations and `updateRegion` renderer refresh tested, including stationary-pointer transitions; runtime pending |
| Start without Region Configuration | All five temporary buttons use public placement/document APIs; native interaction smoke pending |

Relevant tests use a single Region identity, multiple boundary fixtures, a hole, reordered/removed/moved geometry, preserved source arrays/UUID/metadata, no persisted preview, cancellation, shared guard and stale-target rejection. Renderer fixtures verify that new resolved results are consumed; they do not implement or certify Foundry's boolean geometry engine. The following runtime probe is provided precisely to close that remaining evidence gap; **it has not been executed by this task**.

### Extension smoke: interactive operations

1. Rebuild/reload the disposable world. Use one marked POI Region (or select one if there are several). Record its UUID, `toObject().shapes.length`, spike flag and `canvas.scene.regions.size`.
2. Click **Adicionar Shape ao POI** and position the circle away from the existing L. Confirm. Region count, UUID and flag must stay unchanged; shape count increases by one. Both disconnected areas must use a single custom overlay and hover correctly with Token controls active.
3. Click **Adicionar hole ao POI** and place the smaller circle wholly inside the positive circle. Confirm. Shape count increases again; the last shape has `hole: true`. The outline must include the hole boundary. Hover inside the hole must leave the Region cyan; outside the hole but inside the circle must turn it yellow. Hover highlights the entire one-Region outline, including disconnected parts.
4. Click **Reposicionar última Shape do POI** and move the hole elsewhere inside the positive area. Its old location must become hoverable and the new hole must not be hoverable. Shape count and Region identity remain unchanged. Cancel another reposition with Esc and verify no change.
5. With the hole last, click **Mover última Shape do POI para o início**. The positive Shapes now follow it, so its former cutout should fill and hover should activate there. Restore the original order with the public console update below if needed. Click **Remover última Shape do POI** and verify that the actual last shape (which may now be positive) disappears. Keep track of list order; this button does not mean “remove hole.”
6. Repeat hover after pan/zoom, then reload. Verify serialized shape order/roles, one Region UUID and one graphic remain. Check a concurrent shape change or Scene switch while positioning: no stale append should be saved. No step should open Region Configuration.

### Native geometry probe — run in the Foundry GM console

Use a disposable POI Region with no automated behaviors. The probe temporarily substitutes deterministic Shapes **on that same Region**, checks actual Foundry containment after each persisted update, then restores the original Shapes in `finally`. It never creates or deletes a Region. Run without other GM edits during the probe. The geometry is at scene coordinates near `(500, 500)`; the assertions do not require the camera to be there. Visual hover remains the interactive smoke above.

```js
await (async () => {
  if (!game.user.isGM || !canvas.ready) throw new Error("Execute como GM com canvas pronto.");
  const scene = canvas.scene;
  const marked = r => !!r.getFlag("ordemparanormal2", "poiCanvasSpike")?.itemUuid;
  const selected = canvas.regions.controlled.map(o => o.document).filter(marked);
  const targets = selected.length ? selected : [...scene.regions].filter(marked);
  if (targets.length !== 1) throw new Error("Selecione exatamente uma Region POI de teste.");
  const r = targets[0];
  const original = r.toObject().shapes;
  const uuid = r.uuid;
  const flag = JSON.stringify(r.getFlag("ordemparanormal2", "poiCanvasSpike"));
  const count = scene.regions.size;
  const box = (x, y, w, h, hole = false) => ({
    type: "polygon", points: [x,y,x+w,y,x+w,y+h,x,y+h], hole
  });
  const a = box(500,500,200,200), b = box(800,500,100,100);
  const h = box(540,540,40,40,true), moved = box(620,620,40,40,true);
  const assert = (ok, label) => { if (!ok) throw new Error(label); };
  const inside = (x,y) => r.polygonTree.testPoint({x,y});
  const results = [];
  const apply = async (label, shapes, probes) => {
    await r.update({shapes});
    assert(r.uuid === uuid && scene.regions.size === count, "Identidade/quantidade de Regions mudou");
    assert(JSON.stringify(r.getFlag("ordemparanormal2", "poiCanvasSpike")) === flag, "Referência POI mudou");
    assert(r.toObject().shapes.length === shapes.length, "Quantidade de Shapes incorreta");
    for (const [x,y,expected] of probes) assert(inside(x,y) === expected, `${label}: ponto ${x},${y}`);
    const root = canvas.interface.children.find(c => c.name === "ordemparanormal2-poi-canvas-spike");
    assert(root?.children.filter(g => g.name === `poi-region-${r.id}`).length === 1, "Overlay da Region ausente/duplicado");
    results.push({operation: label, result: "PASS", shapes: shapes.length, boundaries: r.polygons.length});
  };
  try {
    await apply("base", [a], [[560,560,true],[850,550,false]]);
    await apply("segunda Shape positiva", [a,b], [[510,510,true],[850,550,true],[750,550,false]]);
    await apply("hole após positivas", [a,b,h], [[560,560,false],[510,510,true],[850,550,true]]);
    await apply("hole antes das positivas", [h,a,b], [[560,560,true],[850,550,true]]);
    await apply("restaurar ordem", [a,b,h], [[560,560,false]]);
    await apply("reposicionar hole", [a,b,moved], [[560,560,true],[640,640,false]]);
    await apply("remover hole", [a,b], [[560,560,true],[640,640,true],[850,550,true]]);
    await apply("remover segunda positiva", [a], [[850,550,false],[510,510,true]]);
    console.table(results);
  } finally {
    if (scene.regions.get(r.id) === r) await r.update({shapes: original});
  }
})();
```

Any thrown assertion is a failure to investigate before closing runtime acceptance. The console table is evidence only after execution; no PASS from this probe is claimed in this report yet. Restoring original Shapes triggers the same renderer update path. A failure during restoration must be handled in the disposable world before continuing the test.

### Extension validation

Node `24.19.0`. `npm test -- src/adapters/foundry/poi-canvas-spike`: **25 tests passed in 2 files**. `npm run check`: **87 files / 662 tests passed**, typecheck and production build passed. No production feature, migration, commit or push is included.

The first full-gate attempt failed with `EBUSY` because Foundry held the generated abilities pack open; its cleanup had removed `CURRENT`. After the user closed Foundry, the complete gate was rerun successfully in the checkout. All packs were regenerated and `packs/abilities/CURRENT` was verified restored. Close the world/server using this checkout before running the pack-generating gate again.
