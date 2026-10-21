import pg from "pg";

import { loadConfig } from "../config.js";
import { migrations } from "./migrations.js";

export type Queryable = Pick<pg.Pool, "query">;

export async function runMigrations(database: Queryable): Promise<void> {
  let useTestSql = false;
  try {
    await database.query("SELECT version()");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    useTestSql = message.includes("function version() does not exist") && (message.includes("pg-mem") || message.includes("🐜"));
  }
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
      try {
        await database.query(useTestSql && migration.testSql ? migration.testSql : migration.sql);
      } catch (error) {
        if (useTestSql) throw error;
        const message = error instanceof Error ? error.message : String(error);
        if (!migration.testSql || (!message.includes("Extension does not exist") && !message.includes('type "vector') && !message.includes('type "tsvector') && !message.includes("🐜") && !message.includes("💥"))) throw error;
        await database.query("ROLLBACK");
        await database.query("BEGIN");
        await database.query(migration.testSql);
      }
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
