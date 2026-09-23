import { randomUUID } from "node:crypto";
import { chmod, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import pg from "pg";

import { loadConfig } from "../config.js";
import { hashPassword } from "../security/passwords.js";
import type { Database, Role } from "./repositories.js";

export type SeedAccount = {
  accountIdentifier: string;
  password: string;
  role: Role;
  classId: string;
  className: string;
};

export async function seedAccounts(
  database: Database,
  accounts: SeedAccount[],
): Promise<void> {
  for (const account of accounts) {
    await database.query(
      `INSERT INTO classes (id, name) VALUES ($1, $2)
       ON CONFLICT (id) DO NOTHING`,
      [account.classId, account.className],
    );
    const passwordHash = await hashPassword(account.password);
    await database.query(
      `INSERT INTO users
        (id, account_identifier, password_hash, role, class_id)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (account_identifier) DO NOTHING`,
      [
        randomUUID(),
        account.accountIdentifier,
        passwordHash,
        account.role,
        account.classId,
      ],
    );
  }
}

export async function seedCourseData(
  database: Database,
  storageRoot: string,
): Promise<void> {
  const definitions = [
    {
      id: "seed-material-class-a",
      account: "teacher-a",
      classId: "class-a",
      filename: "class-a-introduction.md",
      storageKey: "seed-class-a.md",
      content: "# Class A introduction\n\nClass A private teaching material.",
    },
    {
      id: "seed-material-class-b",
      account: "teacher-b",
      classId: "class-b",
      filename: "class-b-introduction.md",
      storageKey: "seed-class-b.md",
      content: "# Class B introduction\n\nClass B private teaching material.",
    },
  ] as const;

  await mkdir(storageRoot, { recursive: true });
  for (const definition of definitions) {
    const user = await database.query(
      "SELECT id FROM users WHERE account_identifier = $1",
      [definition.account],
    );
    if (!user.rows[0]) throw new Error(`Missing seeded account: ${definition.account}`);
    try {
      await writeFile(path.join(storageRoot, definition.storageKey), definition.content, {
        flag: "wx",
        mode: 0o644,
      });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
    await chmod(path.join(storageRoot, definition.storageKey), 0o644);
    await database.query(
      `INSERT INTO materials
        (id, uploader_user_id, class_id, original_filename, storage_key, file_type, size_bytes)
       VALUES ($1, $2, $3, $4, $5, 'md', $6)
       ON CONFLICT (id) DO NOTHING`,
      [definition.id, user.rows[0].id, definition.classId, definition.filename, definition.storageKey, Buffer.byteLength(definition.content)],
    );
    await database.query(
      `INSERT INTO knowledge_entries
        (id, material_id, class_id, content, search_document, sequence_number)
       VALUES ($1, $2, $3, $4, $4, 0)
       ON CONFLICT (id) DO NOTHING`,
      [`seed-entry-${definition.classId}`, definition.id, definition.classId, definition.content],
    );
  }
}

async function main(): Promise<void> {
  const config = loadConfig();
  const teacherPassword = process.env.SEED_TEACHER_PASSWORD;
  const studentPassword = process.env.SEED_STUDENT_PASSWORD;
  if (!teacherPassword || !studentPassword) {
    throw new Error(
      "SEED_TEACHER_PASSWORD and SEED_STUDENT_PASSWORD are required",
    );
  }

  const pool = new pg.Pool({ connectionString: config.databaseUrl });
  try {
    await seedAccounts(pool, [
      {
        accountIdentifier: "teacher-a",
        password: teacherPassword,
        role: "teacher",
        classId: "class-a",
        className: "Class A",
      },
      {
        accountIdentifier: "student-a",
        password: studentPassword,
        role: "student",
        classId: "class-a",
        className: "Class A",
      },
      {
        accountIdentifier: "teacher-b",
        password: teacherPassword,
        role: "teacher",
        classId: "class-b",
        className: "Class B",
      },
      {
        accountIdentifier: "student-b",
        password: studentPassword,
        role: "student",
        classId: "class-b",
        className: "Class B",
      },
    ]);
    await seedCourseData(pool, config.materialStorageRoot);
  } finally {
    await pool.end();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
