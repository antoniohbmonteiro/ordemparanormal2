import { access, readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

interface PackEntry {
  readonly _id: string;
  readonly _key: string;
  readonly name: string;
  readonly type: string;
}

interface PackItemSource extends PackEntry {
  readonly img: string;
  readonly system: Record<string, unknown>;
  readonly effects: readonly unknown[];
  readonly folder: string | null;
}

interface PackFolderSource extends PackEntry {
  readonly description: string;
  readonly folder: string | null;
  readonly sorting: string;
  readonly sort: number;
  readonly color: string | null;
  readonly flags: Record<string, unknown>;
}

const ABILITY_DEFINITIONS = [
  ["Amor Pela Descoberta", "amor-pela-descoberta", "abilityfldoccp01"],
  ["Avaliação", "avaliacao", "abilityfldanly01"],
  ["Conhecimento Técnico", "conhecimento-tecnico", "abilityfldoccp01"],
  ["Esforço e Suor", "esforco-e-suor", "abilityfldoccp01"],
  ["Estoico", "estoico", "abilityfldoccp01"],
  ["Foco Emocional", "foco-emocional", "abilityfldoccp01"],
  ["Foco Mental", "foco-mental", "abilityfldoccp01"],
  ["Ímpeto", "impeto", "abilityfldexec01"],
  ["Incansável", "incansavel", "abilityfldoccp01"],
  ["Linha de Tiro", "linha-de-tiro", "abilityfldoccp01"],
  ["Mentoria", "mentoria", "abilityfldoccp01"],
  ["Olhar Infalível", "olhar-infalivel", "abilityfldoccp01"],
  ["Para Bellum", "para-bellum", "abilityfldoccp01"],
  ["Prontidão", "prontidao", "abilityfldvigi01"],
  ["Técnica Medicinal", "tecnica-medicinal", "abilityfldoccp01"],
  ["Varredura Ampla", "varredura-ampla", "abilityfldoccp01"],
] as const;

const FOLDER_DEFINITIONS = [
  ["abilityfldexec01", "Executor", 100000],
  ["abilityfldanly01", "Analista", 200000],
  ["abilityfldvigi01", "Vigilante", 300000],
  ["abilityfldoccp01", "Ocupações", 400000],
] as const;

const EQUIPMENT_DEFINITIONS = [
  ["Faca de Churrasco", "weapon", "equipmentfldar01", null],
  ["Câmera Modificada", "tool", "equipmentfldfe01", null],
  ["Laboratório Portátil", "tool", "equipmentfldfe01", null],
  ["Lanterna de Estouro Ultravioleta", "tool", "equipmentfldfe01", { value: 3, max: 3 }],
  ["Laser de Varredura", "tool", "equipmentfldfe01", null],
  ["Leitor Infravermelho", "tool", "equipmentfldfe01", null],
  ["Medidor EMF", "tool", "equipmentfldfe01", null],
  ["Pó Revelador", "tool", "equipmentfldfe01", { value: 5, max: 5 }],
  ["Rádio Modificado", "tool", "equipmentfldfe01", null],
  ["Termômetro Diferencial", "tool", "equipmentfldfe01", null],
] as const;

const EQUIPMENT_FOLDER_DEFINITIONS = [
  ["equipmentfldar01", "Armas", 100000],
  ["equipmentfldfe01", "Ferramentas", 200000],
] as const;

function isItemSource(entry: PackEntry): entry is PackItemSource {
  return entry._key.startsWith("!items!");
}

function isFolderSource(entry: PackEntry): entry is PackFolderSource {
  return entry._key.startsWith("!folders!");
}

async function readPackSources(
  directory: "abilities" | "profiles" | "occupations" | "equipment",
) {
  const path = fileURLToPath(
    new URL(`../../packs-src/${directory}/`, import.meta.url),
  );
  const filenames = (await readdir(path)).filter((name) => name.endsWith(".json"));
  return Promise.all(
    filenames.map(async (filename) =>
      JSON.parse(await readFile(`${path}/${filename}`, "utf8")) as PackEntry,
    ),
  );
}

describe("core compendium sources", () => {
  it("defines the exact Ability roster with stable ids, content, and folders", async () => {
    const entries = await readPackSources("abilities");
    const abilities = entries
      .filter(isItemSource)
      .sort((left, right) => left._id.localeCompare(right._id));

    expect(entries).toHaveLength(20);
    expect(abilities).toHaveLength(ABILITY_DEFINITIONS.length);

    for (const [index, ability] of abilities.entries()) {
      const [name, slug, folder] = ABILITY_DEFINITIONS[index];
      const id = `ability${String(index + 1).padStart(9, "0")}`;
      expect(ability).toMatchObject({
        _id: id,
        _key: `!items!${id}`,
        name,
        type: "ability",
        img: `systems/ordemparanormal2/assets/icons/abilities/${slug}.svg`,
        folder,
        system: {
          cost: { source: "none", amount: 0 },
          resource: null,
        },
        effects: [],
      });

      const description = ability.system.description;
      expect(description).toEqual(expect.any(String));
      expect(description).toMatch(/^<p>.+<\/p>$/);
    }

    expect(
      abilities
        .filter(({ system }) =>
          String(system.description).includes("<strong>Upgrade:</strong>"),
        )
        .map(({ name }) => name),
    ).toEqual(["Foco Mental", "Ímpeto"]);

    const impetus = abilities.find(({ name }) => name === "Ímpeto");
    expect(impetus?.system.description).toContain(
      "apagar 2 espaços para adicionar +d10",
    );
    expect(impetus?.system.description).not.toContain(
      "apagar 3 espaços para adicionar +d10",
    );
  });

  it("defines reproducible editorial folders inside the Ability pack", async () => {
    const folders = (await readPackSources("abilities"))
      .filter(isFolderSource)
      .sort((left, right) => left.sort - right.sort);

    expect(folders).toHaveLength(FOLDER_DEFINITIONS.length);
    for (const [index, folder] of folders.entries()) {
      const [id, name, sort] = FOLDER_DEFINITIONS[index];
      expect(folder).toEqual({
        _id: id,
        _key: `!folders!${id}`,
        name,
        type: "Item",
        description: "",
        folder: null,
        sorting: "a",
        sort,
        color: null,
        flags: {},
      });
    }
  });

  it("defines only the three approved Profile relationships", async () => {
    const profiles = (await readPackSources("profiles"))
      .filter(isItemSource)
      .sort((left, right) => left._id.localeCompare(right._id));
    const abilities = (await readPackSources("abilities")).filter(isItemSource);
    const abilityIds = new Set(abilities.map(({ _id }) => _id));
    const expected = [
      ["profile000000001", "Executor", "executor", "ability000000008", "#AE2C12"],
      ["profile000000002", "Analista", "analista", "ability000000002", "#4176BA"],
      ["profile000000003", "Vigilante", "vigilante", "ability000000014", "#4B7E2F"],
    ] as const;

    expect(profiles).toHaveLength(3);
    for (const [index, profile] of profiles.entries()) {
      const [id, name, iconSlug, abilityId, accentColor] = expected[index];
      const uuid = `Compendium.ordemparanormal2.abilities.Item.${abilityId}`;
      const iconPath = `systems/ordemparanormal2/assets/icons/profiles/${iconSlug}.svg`;
      expect(profile).toMatchObject({
        _id: id,
        _key: `!items!${id}`,
        name,
        type: "profile",
        img: iconPath,
        system: { accentColor, abilityGrants: [{ uuid }] },
        effects: [],
      });
      expect(abilityIds).toContain(abilityId);
      await expect(
        access(
          fileURLToPath(
            new URL(`../../assets/icons/profiles/${iconSlug}.svg`, import.meta.url),
          ),
        ),
      ).resolves.toBeUndefined();
    }
  });

  it("defines the eight approved Occupations without speculative system data", async () => {
    const occupations = (await readPackSources("occupations"))
      .filter(isItemSource)
      .sort((left, right) => left._id.localeCompare(right._id));
    const names = [
      "Artista",
      "Cientista",
      "Médico",
      "Militar",
      "Operário",
      "Policial",
      "Professor",
      "Profissional de Escritório",
    ];

    expect(occupations).toHaveLength(names.length);
    for (const [index, occupation] of occupations.entries()) {
      const id = `occupation${String(index + 1).padStart(6, "0")}`;
      expect(occupation).toMatchObject({
        _id: id,
        _key: `!items!${id}`,
        name: names[index],
        type: "occupation",
        img: "icons/svg/item-bag.svg",
        system: {},
        effects: [],
        folder: null,
      });
    }
  });

  it("defines the exact Equipment roster with stable ids, categories, uses, and folders", async () => {
    const entries = await readPackSources("equipment");
    const equipment = entries
      .filter(isItemSource)
      .sort((left, right) => left._id.localeCompare(right._id));

    expect(entries).toHaveLength(12);
    expect(equipment).toHaveLength(EQUIPMENT_DEFINITIONS.length);

    for (const [index, item] of equipment.entries()) {
      const [name, category, folder, uses] = EQUIPMENT_DEFINITIONS[index];
      const id = `equipment${String(index + 1).padStart(7, "0")}`;
      expect(item).toMatchObject({
        _id: id,
        _key: `!items!${id}`,
        name,
        type: "equipment",
        folder,
        system: { category, uses },
        effects: [],
      });

      const description = item.system.description;
      expect(description).toEqual(expect.any(String));
      expect(description).toMatch(/^<p>.+<\/p>$/);
    }
  });

  it("defines reproducible editorial folders inside the Equipment pack", async () => {
    const folders = (await readPackSources("equipment"))
      .filter(isFolderSource)
      .sort((left, right) => left.sort - right.sort);

    expect(folders).toHaveLength(EQUIPMENT_FOLDER_DEFINITIONS.length);
    for (const [index, folder] of folders.entries()) {
      const [id, name, sort] = EQUIPMENT_FOLDER_DEFINITIONS[index];
      expect(folder).toEqual({
        _id: id,
        _key: `!folders!${id}`,
        name,
        type: "Item",
        description: "",
        folder: null,
        sorting: "a",
        sort,
        color: null,
        flags: {},
      });
    }
  });

  it("declares all four Item packs under the native system folder", async () => {
    const systemPath = fileURLToPath(new URL("../../system.json", import.meta.url));
    const system = JSON.parse(await readFile(systemPath, "utf8")) as {
      readonly documentTypes: {
        readonly Item: Record<string, unknown>;
      };
      readonly packs: readonly unknown[];
      readonly packFolders: readonly unknown[];
    };
    expect(Object.keys(system.documentTypes.Item)).toEqual([
      "profile",
      "occupation",
      "ability",
      "pointOfInterest",
      "equipment",
    ]);
    expect(system.packs).toEqual([
      {
        name: "profiles",
        label: "Perfis",
        path: "packs/profiles",
        type: "Item",
        system: "ordemparanormal2",
        ownership: {
          PLAYER: "OBSERVER",
          TRUSTED: "OBSERVER",
          ASSISTANT: "OWNER",
        },
      },
      {
        name: "abilities",
        label: "Habilidades",
        path: "packs/abilities",
        type: "Item",
        system: "ordemparanormal2",
        ownership: {
          PLAYER: "OBSERVER",
          TRUSTED: "OBSERVER",
          ASSISTANT: "OWNER",
        },
      },
      {
        name: "occupations",
        label: "Ocupações",
        path: "packs/occupations",
        type: "Item",
        system: "ordemparanormal2",
        ownership: {
          PLAYER: "OBSERVER",
          TRUSTED: "OBSERVER",
          ASSISTANT: "OWNER",
        },
      },
      {
        name: "equipment",
        label: "Equipamentos",
        path: "packs/equipment",
        type: "Item",
        system: "ordemparanormal2",
        ownership: {
          PLAYER: "OBSERVER",
          TRUSTED: "OBSERVER",
          ASSISTANT: "OWNER",
        },
      },
    ]);
    expect(system.packFolders).toEqual([
      {
        name: "Ordem Paranormal 2",
        sorting: "a",
        color: "#000000",
        packs: ["abilities", "profiles", "occupations", "equipment"],
        folders: [],
      },
    ]);
  });
});
