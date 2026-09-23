import { expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { poiSceneRowView } from "./poi-scene-panel-view";

const entry = { itemUuid: "Item.poi", name: "Armário", img: "", linkedRegionIds: ["region"] };
const localize = (key: string) => key.split(".").at(-1)!;

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
