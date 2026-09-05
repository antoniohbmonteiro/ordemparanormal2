import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import type { SceneControl } from "@client/applications/ui/scene-controls.mjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import translations from "../../../../lang/pt-BR.json";
import { addPoiSceneControls } from "./poi-scene-controls";

const controlName = "ordemparanormal2-poi";
const labels = translations.ORDEMPARANORMAL2.PointOfInterest.SceneControls;
const nativeCallback = vi.fn();
const nativeTools = Object.freeze(Object.fromEntries(
  ["select", "rectangle", "ellipse", "polygon", "hole"].map((name, order) => [
    name,
    Object.freeze({
      name,
      order,
      title: `Native ${name}`,
      icon: `native-icon-${name}`,
      visible: false,
      button: true,
      toggle: true,
      active: true,
      creation: true,
      control: true,
      interaction: true,
      onChange: nativeCallback,
      shapeData: { type: name },
      createData: { name: "Region" },
      toolclip: { src: "native.webm" },
    }),
  ]),
));
const prepareSceneControls = vi.fn(() => ({
  tools: nativeTools,
  onChange: nativeCallback,
  onToolChange: nativeCallback,
}));

function stubGame(isGM: boolean): void {
  vi.stubGlobal("game", {
    user: { isGM },
    i18n: {
      localize: (key: string) => {
        const label = key.replace("ORDEMPARANORMAL2.PointOfInterest.SceneControls.", "");
        return labels[label as keyof typeof labels] ?? key;
      },
    },
    get items() { throw new Error("Controls must not access Items"); },
    get settings() { throw new Error("Controls must not access settings"); },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  stubGame(true);
  vi.stubGlobal("foundry", {
    canvas: { layers: { RegionLayer: { prepareSceneControls } } },
  });
});

afterEach(() => vi.unstubAllGlobals());

describe("POI Scene Controls", () => {
  it("appends one stable group and preserves other controls across rebuilds", () => {
    const other: SceneControl = Object.freeze({
      name: "other",
      order: 42,
      title: "Other",
      icon: "other-icon",
      activeTool: "select",
      tools: {},
    });
    const controls = { other } as Record<string, SceneControl>;

    addPoiSceneControls(controls);
    addPoiSceneControls(controls);

    expect(Object.keys(controls)).toEqual(["other", controlName]);
    expect(controls.other).toBe(other);
    expect(controls[controlName].order).toBe(43);
    const rebuilt = { other } as Record<string, SceneControl>;
    addPoiSceneControls(rebuilt);
    expect(rebuilt).toEqual(controls);
  });

  it.each([true, false])("declares group visibility for isGM=%s", (isGM) => {
    stubGame(isGM);
    const controls: Record<string, SceneControl> = {};
    addPoiSceneControls(controls);

    expect(controls[controlName]).toMatchObject({
      name: controlName,
      title: "Pontos de Interesse",
      icon: "op2-poi-control-icon",
      visible: isGM,
      order: 0,
      activeTool: "selectPoi",
    });
  });

  it("offers six exclusive passive modes using only native icon strings", () => {
    const controls: Record<string, SceneControl> = {};
    addPoiSceneControls(controls);
    const group = controls[controlName];
    const expected = [
      ["selectPoi", "Selecionar POI", "native-icon-select"],
      ["createRectangle", "Criar POI retangular", "native-icon-rectangle"],
      ["createEllipse", "Criar POI elíptico", "native-icon-ellipse"],
      ["createPolygon", "Criar POI poligonal", "native-icon-polygon"],
      ["addArea", "Adicionar área ao POI", "fa-solid fa-plus"],
      ["createHole", "Criar buraco no POI", "native-icon-hole"],
    ];

    expect(Object.keys(group.tools)).toEqual(expected.map(([name]) => name));
    expect(Object.values(group.tools)).toEqual(expected.map(([name, title, icon], order) => ({
      name, title, icon, order,
      button: false,
      toggle: false,
      creation: false,
      control: false,
      interaction: false,
    })));
    expect(Object.keys(group).sort()).toEqual([
      "activeTool", "icon", "name", "order", "title", "tools", "visible",
    ]);
    expect(prepareSceneControls).toHaveBeenCalledExactlyOnceWith();
    expect(nativeCallback).not.toHaveBeenCalled();
  });

  it("preserves the supplied magnifying glass including its existing flip", () => {
    const asset = readFileSync(new URL(
      "../../../../assets/icons/points-of-interest/magnifying-glass.svg",
      import.meta.url,
    ));
    expect(createHash("sha256").update(asset).digest("hex")).toBe(
      "0378286530d604097421c6257eec2f12289264661b8ec85de1593bff08ad762b",
    );
    expect(asset.toString()).toContain('viewBox="0 0 512 512"');
    expect(asset.toString()).toContain('fill="currentColor"');
    expect(asset.toString()).toContain('transform="scale(-1 1)"');
  });

  it("wires the group icon to the manifest stylesheet and an alpha mask", () => {
    const css = readFileSync(new URL("../../../../styles/poi-scene-controls.css", import.meta.url), "utf8");
    const manifest = JSON.parse(readFileSync(new URL("../../../../system.json", import.meta.url), "utf8"));
    const controls: Record<string, SceneControl> = {};
    addPoiSceneControls(controls);

    expect(manifest.styles).toContain("styles/poi-scene-controls.css");
    expect(css).toContain(`.${controls[controlName].icon}::before {`);
    expect(css).toContain('content: "";');
    expect(css).toContain("flex-shrink: 0;");
    // Icon classes land on the native button: no rule may style that host.
    const selectors = [...css.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{/g)]
      .map((match) => match[1].trim());
    expect(selectors).toEqual([`.${controls[controlName].icon}::before`]);
    expect(css).toContain('mask: url("../assets/icons/points-of-interest/magnifying-glass.svg") center / contain no-repeat;');
    expect(css).toContain("mask-mode: alpha;");
    expect(css).toContain("background-color: currentColor;");
    expect(css).toContain("width: 1.125em;");
    expect(css).toContain("height: 1.125em;");
    expect(css).not.toMatch(/transform|(?<!-)\bcolor\s*:/);
  });
});
