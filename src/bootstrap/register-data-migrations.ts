import {
  CURRENT_DATA_MIGRATION_VERSION,
  DATA_MIGRATION_VERSION_SETTING_KEY,
  SYSTEM_ID,
} from "../config/system-config";
import { migrateAgentOccupations } from "../migrations/migrate-agent-occupation";

interface MigrationGame {
  readonly actors: Iterable<foundry.documents.Actor>;
}

interface DataMigration {
  readonly version: number;
  run(): Promise<void>;
}

function migrations(): readonly DataMigration[] {
  const migrationGame = game as typeof game & MigrationGame;
  return [
    {
      version: 1,
      run: () => migrateAgentOccupations(migrationGame.actors),
    },
  ];
}

export async function runPendingDataMigrations(): Promise<void> {
  if (!game.user?.isActiveGM) return;
  const stored = game.settings.get(
    SYSTEM_ID,
    DATA_MIGRATION_VERSION_SETTING_KEY,
  );
  const current = typeof stored === "number" && Number.isInteger(stored)
    ? stored
    : 0;
  if (current > CURRENT_DATA_MIGRATION_VERSION) {
    console.warn(
      `${SYSTEM_ID} | World data version ${current} is newer than supported version ${CURRENT_DATA_MIGRATION_VERSION}.`,
    );
    return;
  }
  if (current === CURRENT_DATA_MIGRATION_VERSION) return;

  const pending = migrations()
    .filter(({ version }) => version > current && version <= CURRENT_DATA_MIGRATION_VERSION)
    .sort((left, right) => left.version - right.version);
  for (const migration of pending) await migration.run();
  await game.settings.set(
    SYSTEM_ID,
    DATA_MIGRATION_VERSION_SETTING_KEY,
    CURRENT_DATA_MIGRATION_VERSION,
  );
}

async function runReadyMigrations(): Promise<void> {
  try {
    await runPendingDataMigrations();
  } catch (error) {
    console.error(`${SYSTEM_ID} | Data migration failed`, error);
    ui.notifications.error(
      game.i18n.localize("ORDEMPARANORMAL2.Migrations.Errors.Failed"),
    );
  }
}

export function registerDataMigrations(): void {
  game.settings.register(SYSTEM_ID, DATA_MIGRATION_VERSION_SETTING_KEY, {
    name: "ORDEMPARANORMAL2.Migrations.SettingName",
    scope: "world",
    config: false,
    type: Number,
    default: 0,
  });
  Hooks.once("ready", () => {
    void runReadyMigrations();
  });
}
