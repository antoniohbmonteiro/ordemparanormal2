import { expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { filterPoiSceneEntries, poiSceneRowView } from "./poi-scene-panel-view";

const entry = { itemUuid: "Item.poi", name: "Armário", img: "", linkedRegionIds: ["region"] };
const localize = (key: string) => key.split(".").at(-1)!;

it("searches only names without case or accents, preserving entries and order", () => {
  const entries = [
    { ...entry, name: "Ídolo de Pedra" },
    { ...entry, itemUuid: "Item.idolo", name: "Armário", knownGroups: [{ text: "Ídolo" }] },
    { ...entry, itemUuid: "Item.second", name: "Outro ídolo" },
  ];
  const original = structuredClone(entries);
  const filtered = filterPoiSceneEntries(entries, "  IDOLO  ");
  expect(filtered).toEqual([entries[0], entries[2]]);
  expect(filtered[0]).toBe(entries[0]);
  expect(filterPoiSceneEntries(entries, "ÍDOLO")).toEqual(filtered);
  expect(filterPoiSceneEntries(entries, "arma\u0301rio")).toEqual([entries[1]]);
  expect(filterPoiSceneEntries(entries, "inexistente")).toEqual([]);
  expect(filterPoiSceneEntries(entries, "")).toEqual(entries);
  expect(filterPoiSceneEntries(entries, "   ")).toEqual(entries);
  expect(entries).toEqual(original);
});

it("shows the requested visibility and spatial summaries", () => {
  const hidden = poiSceneRowView(entry, { mode: "hidden", users: [], notified: [] }, 0, localize);
  expect(hidden).toMatchObject({ visibilityLabel: "Hidden", visibilityIcon: "fa-eye-slash", locationLabel: "NoLocation" });
  const everyone = poiSceneRowView(entry, { mode: "everyone", users: [], notified: [] }, 1, localize);
  expect(everyone).toMatchObject({ visibilityLabel: "VisibleEveryone", locationLabel: "OneLocation" });
  const users = poiSceneRowView(entry, { mode: "users", users: ["player"], notified: [] }, 2, localize);
  expect(users).toMatchObject({ visibilityLabel: "VisibleUsers", locationLabel: "2 ManyLocations" });
  expect(poiSceneRowView(entry, null, 1, localize).visibilityLabel).toBe("VisibleToYou");
  expect(poiSceneRowView(entry, null, 1, localize, "gm").visibilityLabel).toBe("Unavailable");
});

it("keeps Point of Interest interface copy in Portuguese without POI, Scene or Region labels", () => {
  const file = fileURLToPath(new URL("../../../lang/pt-BR.json", import.meta.url));
  const translations = JSON.parse(readFileSync(file, "utf8")) as { ORDEMPARANORMAL2: { PointOfInterest: unknown } };
  const values: string[] = [];
  const collect = (value: unknown): void => {
    if (typeof value === "string") values.push(value);
    else if (value && typeof value === "object") Object.values(value).forEach(collect);
  };
  collect(translations.ORDEMPARANORMAL2.PointOfInterest);
  expect(values.join("\n")).not.toMatch(/\b(?:POI|Scene|Region)\b/u);
});
