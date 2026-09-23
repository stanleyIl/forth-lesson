import { DataType, newDb } from "pg-mem";

import { runMigrations } from "../../src/db/migrate.js";

export async function createTestDatabase() {
  const memoryDatabase = newDb();
  memoryDatabase.public.registerFunction({
    name: "trim",
    args: [DataType.text],
    returns: DataType.text,
    implementation: (value: string) => value.trim(),
  });
  memoryDatabase.public.registerFunction({
    name: "length",
    args: [DataType.text],
    returns: DataType.integer,
    implementation: (value: string) => value.length,
  });
  const adapter = memoryDatabase.adapters.createPg();
  const pool = new adapter.Pool();
  await runMigrations(pool);
  return pool;
}
