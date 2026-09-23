import pg from "pg";

import { loadConfig } from "../config.js";
import { migrations } from "./migrations.js";

export type Queryable = Pick<pg.Pool, "query">;

export async function runMigrations(database: Queryable): Promise<void> {
  await database.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  for (const migration of migrations) {
    const existing = await database.query(
      "SELECT id FROM schema_migrations WHERE id = $1",
      [migration.id],
    );
    if (existing.rowCount && existing.rowCount > 0) {
      continue;
    }

    await database.query("BEGIN");
    try {
      await database.query(migration.sql);
      await database.query(
        "INSERT INTO schema_migrations (id) VALUES ($1)",
        [migration.id],
      );
      await database.query("COMMIT");
    } catch (error) {
      await database.query("ROLLBACK");
      throw error;
    }
  }
}

async function main(): Promise<void> {
  const config = loadConfig();
  const pool = new pg.Pool({ connectionString: config.databaseUrl });

  try {
    await runMigrations(pool);
  } finally {
    await pool.end();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
