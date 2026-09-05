import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { beforeEach, describe, expect, it, vi } from "vitest";

const sidebarTab = vi.hoisted(() => ({ class: class NarrativeSidebarTab {} }));

vi.mock(
  "../../../applications/narrative-scenes/narrative-sidebar-tab",
  () => ({ NarrativeSidebarTab: sidebarTab.class }),
);

import { registerNarrativeSidebarTab } from "./register-narrative-sidebar-tab";

interface SidebarDescriptor {
  readonly tooltip?: string;
  readonly icon?: string;
  readonly gmOnly?: boolean;
}

let tabs: Record<string, SidebarDescriptor>;
let uiConfig: Record<string, unknown>;

beforeEach(() => {
  tabs = {
    chat: { icon: "chat" },
    scenes: { icon: "scenes" },
    settings: { icon: "settings" },
  };
  uiConfig = {};
  vi.stubGlobal("CONFIG", { ui: uiConfig });
  vi.stubGlobal("foundry", {
    applications: {
      sidebar: {
        Sidebar: {
          get TABS() {
            return tabs;
          },
          set TABS(value: Record<string, SidebarDescriptor>) {
            tabs = value;
          },
        },
      },
    },
  });
});

describe("Narrative sidebar registration", () => {
  it("registers the class and a GM-only descriptor immediately before settings", () => {
    registerNarrativeSidebarTab();

    expect(uiConfig.narrative).toBe(sidebarTab.class);
    expect(Object.keys(tabs)).toEqual([
      "chat",
      "scenes",
      "narrative",
      "settings",
    ]);
    expect(tabs.narrative).toEqual({
      tooltip: "ORDEMPARANORMAL2.NarrativeScene.Sidebar.Tooltip",
      icon: "fa-solid fa-masks-theater",
      gmOnly: true,
    });
  });

  it("is idempotent and preserves existing tabs", () => {
    registerNarrativeSidebarTab();
    registerNarrativeSidebarTab();

    expect(Object.keys(tabs)).toEqual([
      "chat",
      "scenes",
      "narrative",
      "settings",
    ]);
    expect(tabs.chat).toEqual({ icon: "chat" });
    expect(tabs.scenes).toEqual({ icon: "scenes" });
    expect(tabs.settings).toEqual({ icon: "settings" });
  });

  it("appends the tab when settings is unavailable", () => {
    tabs = { chat: { icon: "chat" } };

    registerNarrativeSidebarTab();

    expect(Object.keys(tabs)).toEqual(["chat", "narrative"]);
  });

  it("does not retain the old Scene Control registration", () => {
    const bootstrapSource = readFileSync(
      fileURLToPath(
        new URL("../../../bootstrap/register-narrative-scenes.ts", import.meta.url),
      ),
      "utf8",
    );

    expect(bootstrapSource).not.toContain("getSceneControlButtons");
    expect(bootstrapSource).not.toContain("registerNarrativeSceneControl");
  });
});
