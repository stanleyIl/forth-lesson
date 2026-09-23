import { randomUUID } from "node:crypto";

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
        accountIdentifier: "student-b",
        password: studentPassword,
        role: "student",
        classId: "class-b",
        className: "Class B",
      },
    ]);
  } finally {
    await pool.end();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
