import { spawn } from "node:child_process";
import { access, mkdir, mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import path from "node:path";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const definitions = [
  { name: "abilities", source: "packs-src/abilities", output: "packs/abilities" },
  { name: "profiles", source: "packs-src/profiles", output: "packs/profiles" },
  {
    name: "occupations",
    source: "packs-src/occupations",
    output: "packs/occupations",
  },
  { name: "equipment", source: "packs-src/equipment", output: "packs/equipment" },
];

function resolveRepositoryPath(relativePath) {
  const resolved = path.resolve(repositoryRoot, relativePath);
  const relative = path.relative(repositoryRoot, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Pack path escaped the repository: ${relativePath}`);
  }
  return resolved;
}

function runCli(args, environment) {
  const cliPath = path.join(
    repositoryRoot,
    "node_modules",
    "@foundryvtt",
    "foundryvtt-cli",
    "fvtt.mjs",
  );
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cliPath, ...args], {
      cwd: repositoryRoot,
      env: environment,
      stdio: "inherit",
    });
    child.once("error", reject);
    child.once("exit", (code) => {
      code === 0
        ? resolve()
        : reject(new Error(`Foundry CLI exited with code ${code}.`));
    });
  });
}

async function compilePack(definition, environment) {
  const source = resolveRepositoryPath(definition.source);
  const output = resolveRepositoryPath(definition.output);
  const expectedSource = path.join(repositoryRoot, "packs-src", definition.name);
  const expectedOutput = path.join(repositoryRoot, "packs", definition.name);
  if (source !== expectedSource) {
    throw new Error(`Unexpected pack source path: ${source}`);
  }
  if (output !== expectedOutput) {
    throw new Error(`Unexpected pack output path: ${output}`);
  }

  await rm(output, { recursive: true, force: true });
  await mkdir(output, { recursive: true });
  await runCli(
    [
      "package",
      "pack",
      definition.name,
      "--id",
      "ordemparanormal2",
      "--type",
      "System",
      "--directory",
      source,
    ],
    environment,
  );
  await access(path.join(output, "CURRENT"));
}

const temporaryRoot = await mkdtemp(path.join(tmpdir(), "op2-packs-"));
try {
  const dataPath = path.join(temporaryRoot, "data");
  const systemsPath = path.join(dataPath, "systems");
  const linkedSystemPath = path.join(systemsPath, "ordemparanormal2");
  const configPath = path.join(temporaryRoot, "config");
  await mkdir(systemsPath, { recursive: true });
  await mkdir(configPath, { recursive: true });
  await symlink(
    repositoryRoot,
    linkedSystemPath,
    process.platform === "win32" ? "junction" : "dir",
  );

  const cliEnvironment = { ...process.env, APPDATA: configPath };
  await runCli(["configure", "set", "dataPath", dataPath], cliEnvironment);

  for (const definition of definitions) {
    await compilePack(definition, cliEnvironment);
  }
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}
