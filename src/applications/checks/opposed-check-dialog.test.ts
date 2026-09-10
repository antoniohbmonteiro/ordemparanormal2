import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SKILL_DEFINITIONS } from "../../config/skills";

const { listCandidatesMock, ensureSharedPartialsLoadedMock } = vi.hoisted(() => ({
  listCandidatesMock: vi.fn(),
  ensureSharedPartialsLoadedMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock(
  "../../adapters/foundry/actors/opposed-check-participant-catalog",
  () => ({ listOpposedCheckParticipantCandidates: listCandidatesMock }),
);
vi.mock("../../adapters/foundry/templates/ensure-shared-partials-loaded", () => ({
  ensureSharedPartialsLoaded: ensureSharedPartialsLoadedMock,
}));

import {
  buildOpposedCheckOptions,
  buildOpposedCheckPreview,
  openOpposedCheckDialog,
  parseEncodedAgentCheckSelection,
} from "./opposed-check-dialog";

function agent(
  uuid: string,
  name: string,
  physical: number,
  fighting: number,
) {
  return {
    uuid,
    type: "agent",
    name,
    img: `actors/${name.toLowerCase()}.webp`,
    system: {
      attributes: { physical, mind: 4, emotion: 4 },
      skills: Object.fromEntries(
        SKILL_DEFINITIONS.map((definition) => [
          definition.key,
          "specializations" in definition
            ? Object.fromEntries(
                definition.specializations.map(({ key }) => [key, 4]),
              )
            : definition.key === "fighting"
              ? fighting
              : 4,
        ]),
      ),
    },
  } as unknown as foundry.documents.Actor;
}

function localize(key: string): string {
  if (key.endsWith(".Physical")) return "Físico";
  if (key.endsWith(".Mind")) return "Mente";
  if (key.endsWith(".Emotion")) return "Emoção";
  return key;
}

function stubGame(): void {
  vi.stubGlobal("game", { i18n: { localize } });
}

afterEach(() => {
  listCandidatesMock.mockReset();
  vi.unstubAllGlobals();
});

describe("Opposed Check options and preview", () => {
  it("builds attributes, simple skills and explicit Aptitude specializations", () => {
    stubGame();

    const groups = buildOpposedCheckOptions(localize);

    expect(groups.map(({ group }) => group)).toEqual([
      "attributes",
      "skills",
      "aptitude",
    ]);
    expect(groups[0]?.options.map(({ value }) => value)).toEqual([
      "attribute|physical",
      "attribute|mind",
      "attribute|emotion",
    ]);
    expect(groups[1]?.options).toContainEqual({
      value: "skill|fighting",
      label: "Luta",
    });
    expect(groups[1]?.options.some(({ value }) => value === "skill|aptitude")).toBe(
      false,
    );
    expect(groups[2]?.options).toContainEqual({
      value: "aptitude|tactics",
      label: "Aptidão: Tática",
    });
    expect(parseEncodedAgentCheckSelection("aptitude|arts")).toEqual({
      kind: "aptitude",
      key: "arts",
    });
  });

  it("builds the preview from the effective Synthetic Actor instead of its base", () => {
    const baseActor = agent("Actor.victor", "Victor", 4, 4);
    const syntheticActor = agent(
      "Scene.scene.Token.victor.Actor.victor",
      "Victor Ferido",
      8,
      6,
    );

    const preview = buildOpposedCheckPreview(
      {
        reference: { kind: "token", uuid: "Scene.scene.Token.victor" },
        effectiveActor: syntheticActor,
        label: "Victor Ferido",
        img: "actors/victor-ferido.webp",
        group: "scene",
      },
      { kind: "skill", key: "fighting" },
      localize,
    );

    expect(preview).toEqual({
      name: "Victor Ferido",
      img: "actors/victor-ferido.webp",
      context: "Físico + Luta",
      formula: "d8 + d6",
    });
    expect((baseActor.system as { attributes: { physical: number } }).attributes.physical).toBe(4);
  });
});

class FakeSelectElement {
  value = "";
  disabled = false;
  readonly options: { value: string; disabled: boolean }[];
  readonly listeners = new Map<string, () => void>();

  constructor(optionValues: readonly string[]) {
    this.options = optionValues.map((value) => ({ value, disabled: false }));
  }

  addEventListener(type: string, listener: () => void): void {
    this.listeners.set(type, listener);
  }

  change(): void {
    this.listeners.get("change")?.();
  }
}

interface PreviewElement {
  textContent: string;
  title: string;
  src: string;
  alt: string;
  setAttribute(name: string, value: string): void;
}

function createDialogHarness(leftValue: string, rightValue: string) {
  const participantValues = ["", leftValue, rightValue];
  const leftParticipant = new FakeSelectElement(participantValues);
  const rightParticipant = new FakeSelectElement(participantValues);
  const leftCheck = new FakeSelectElement(["", "skill|fighting"]);
  const rightCheck = new FakeSelectElement(["", "skill|fighting"]);
  const createButton = { disabled: true };
  const preview = (): PreviewElement => ({
    textContent: "",
    title: "",
    src: "",
    alt: "",
    setAttribute(name, value) {
      if (name === "aria-label") this.title = value;
    },
  });
  const elements = new Map<string, unknown>([
    ['[data-participant-select="left"]', leftParticipant],
    ['[data-participant-select="right"]', rightParticipant],
    ['[data-check-select="left"]', leftCheck],
    ['[data-check-select="right"]', rightCheck],
    ['[data-action="createOpposedCheck"]', createButton],
    ['[data-participant-portrait="left"]', preview()],
    ['[data-participant-portrait="right"]', preview()],
    ['[data-participant-portrait-image="left"]', preview()],
    ['[data-participant-portrait-image="right"]', preview()],
    ['[data-participant-name="left"]', preview()],
    ['[data-participant-name="right"]', preview()],
    ['[data-check-context="left"]', preview()],
    ['[data-check-context="right"]', preview()],
    ['[data-check-formula="left"]', preview()],
    ['[data-check-formula="right"]', preview()],
  ]);
  const root = {
    querySelector: (selector: string) => elements.get(selector) ?? null,
  } as unknown as HTMLElement;
  const submitButton = {
    form: {
      elements: {
        namedItem: (name: string) =>
          ({
            leftParticipant,
            rightParticipant,
            leftCheck,
            rightCheck,
          })[name as "leftParticipant"] ?? null,
      },
    },
  } as unknown as HTMLButtonElement;

  return {
    root,
    submitButton,
    leftParticipant,
    rightParticipant,
    leftCheck,
    rightCheck,
    createButton,
    elements,
  };
}

interface DialogInputOptions {
  readonly ok: {
    readonly callback: (
      event: SubmitEvent,
      button: HTMLButtonElement,
    ) => unknown;
  };
  readonly render: (
    event: Event,
    dialog: { readonly element: HTMLElement },
  ) => void;
}

describe("Opposed Check Dialog", () => {
  it("updates both previews, prevents duplicate selection and returns canonical data", async () => {
    stubGame();
    vi.stubGlobal("HTMLSelectElement", FakeSelectElement);
    const victor = agent("Actor.victor", "Victor", 8, 6);
    const edgar = agent(
      "Scene.scene.Token.edgar.Actor.edgar",
      "Edgar",
      6,
      4,
    );
    const candidates = [
      {
        reference: { kind: "actor" as const, uuid: "Actor.victor" as const },
        effectiveActor: victor,
        label: "Victor",
        img: "actors/victor.webp",
        group: "scene" as const,
      },
      {
        reference: {
          kind: "token" as const,
          uuid: "Scene.scene.Token.edgar" as const,
        },
        effectiveActor: edgar,
        label: "Edgar",
        img: "actors/edgar.webp",
        group: "scene" as const,
      },
    ];
    listCandidatesMock.mockReturnValue(candidates);
    const leftValue = "actor|Actor.victor";
    const rightValue = "token|Scene.scene.Token.edgar";
    const harness = createDialogHarness(leftValue, rightValue);
    const renderTemplate = vi.fn().mockResolvedValue("dialog");
    const input = vi.fn(async (options: DialogInputOptions) => {
      options.render({} as Event, { element: harness.root });
      expect(harness.createButton.disabled).toBe(true);

      harness.leftParticipant.value = leftValue;
      harness.leftParticipant.change();
      expect(harness.leftCheck.disabled).toBe(false);
      expect(
        harness.rightParticipant.options.find(({ value }) => value === leftValue)
          ?.disabled,
      ).toBe(true);

      harness.leftCheck.value = "skill|fighting";
      harness.leftCheck.change();
      harness.rightParticipant.value = rightValue;
      harness.rightParticipant.change();
      harness.rightCheck.value = "skill|fighting";
      harness.rightCheck.change();

      expect(harness.createButton.disabled).toBe(false);
      expect(
        (harness.elements.get('[data-check-formula="left"]') as PreviewElement)
          .textContent,
      ).toBe("d8 + d6");
      expect(
        (harness.elements.get('[data-check-formula="right"]') as PreviewElement)
          .textContent,
      ).toBe("d6 + d4");
      return options.ok.callback({} as SubmitEvent, harness.submitButton);
    });
    vi.stubGlobal("foundry", {
      applications: {
        handlebars: { renderTemplate },
        api: { DialogV2: { input } },
      },
    });

    await expect(openOpposedCheckDialog()).resolves.toEqual({
      left: {
        participant: { kind: "actor", uuid: "Actor.victor" },
        selection: { kind: "skill", key: "fighting" },
      },
      right: {
        participant: { kind: "token", uuid: "Scene.scene.Token.edgar" },
        selection: { kind: "skill", key: "fighting" },
      },
    });
    expect(renderTemplate).toHaveBeenCalledWith(
      "systems/ordemparanormal2/templates/checks/opposed-check-dialog.hbs",
      expect.objectContaining({ hasEnoughParticipants: true }),
    );
    expect(input).toHaveBeenCalledOnce();
    expect(globalThis).not.toHaveProperty("Roll");
    expect(globalThis).not.toHaveProperty("ChatMessage");
  });

  it.each(["cancel", null])("normalizes %j to null", async (dialogResult) => {
    stubGame();
    listCandidatesMock.mockReturnValue([]);
    vi.stubGlobal("foundry", {
      applications: {
        handlebars: { renderTemplate: vi.fn().mockResolvedValue("dialog") },
        api: { DialogV2: { input: vi.fn().mockResolvedValue(dialogResult) } },
      },
    });

    await expect(openOpposedCheckDialog()).resolves.toBeNull();
  });

  it("rejects the same canonical participant during final validation", async () => {
    stubGame();
    vi.stubGlobal("HTMLSelectElement", FakeSelectElement);
    const victor = agent("Actor.victor", "Victor", 8, 6);
    listCandidatesMock.mockReturnValue([
      {
        reference: { kind: "actor", uuid: "Actor.victor" },
        effectiveActor: victor,
        label: "Victor",
        img: "actors/victor.webp",
        group: "scene",
      },
    ]);
    const value = "actor|Actor.victor";
    const harness = createDialogHarness(value, value);
    harness.leftParticipant.value = value;
    harness.rightParticipant.value = value;
    harness.leftCheck.value = "skill|fighting";
    harness.rightCheck.value = "skill|fighting";
    vi.stubGlobal("foundry", {
      applications: {
        handlebars: { renderTemplate: vi.fn().mockResolvedValue("dialog") },
        api: {
          DialogV2: {
            input: vi.fn(async (options: DialogInputOptions) =>
              options.ok.callback({} as SubmitEvent, harness.submitButton),
            ),
          },
        },
      },
    });

    await expect(openOpposedCheckDialog()).rejects.toThrow(
      "participants must be different",
    );
  });
});

describe("Opposed Check Dialog template and styles", () => {
  it("keeps two symmetric columns, VS, explicit selects and scoped styling", async () => {
    const template = await readFile(
      fileURLToPath(
        new URL(
          "../../../templates/checks/opposed-check-dialog.hbs",
          import.meta.url,
        ),
      ),
      "utf8",
    );
    const styles = await readFile(
      fileURLToPath(
        new URL("../../../styles/opposed-check-dialog.css", import.meta.url),
      ),
      "utf8",
    );

    expect(template).toContain('data-participant-select="left"');
    expect(template).toContain('data-participant-select="right"');
    expect(template).toContain('data-check-select="left" disabled');
    expect(template).toContain('data-check-select="right" disabled');
    expect(template).toContain("OpposedCheckDialog.Versus");
    expect(styles).toMatch(
      /\.op2-opposed-check-dialog__matchup\s*{[^}]*grid-template-columns:\s*minmax\(0, 1fr\) 2rem minmax\(0, 1fr\);/s,
    );
    expect(styles).toMatch(
      /button\[data-action="createOpposedCheck"\]:disabled\s*{[^}]*cursor:\s*not-allowed;[^}]*opacity:\s*0\.48;/s,
    );
    expect(template).toContain("{{> opposedCheckPortrait");
    expect(styles).not.toMatch(/@media[^\{]*max-width/);
  });
});
