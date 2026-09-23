import { describe, expect, it } from "vitest";

import {
  KnowledgeEntryRepository,
  MaterialRepository,
} from "../src/db/repositories.js";
import { seedAccounts } from "../src/db/seed.js";
import { verifyPassword } from "../src/security/passwords.js";
import { createTestDatabase } from "./helpers/database.js";

describe("bootstrap and class-scoped repositories", () => {
  it("seeds hashed teacher and student credentials in separate classes", async () => {
    const pool = await createTestDatabase();
    await seedAccounts(pool, [
      {
        accountIdentifier: "teacher-a",
        password: "teacher-password",
        role: "teacher",
        classId: "class-a",
        className: "Class A",
      },
      {
        accountIdentifier: "student-b",
        password: "student-password",
        role: "student",
        classId: "class-b",
        className: "Class B",
      },
    ]);

    const result = await pool.query(
      `SELECT account_identifier, password_hash, role, class_id
       FROM users ORDER BY account_identifier`,
    );
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0].class_id).not.toBe(result.rows[1].class_id);
    expect(JSON.stringify(result.rows)).not.toContain("teacher-password");
    expect(JSON.stringify(result.rows)).not.toContain("student-password");
    await expect(
      verifyPassword(result.rows[1].password_hash, "teacher-password"),
    ).resolves.toBe(true);
    await pool.end();
  });

  it("requires class scope for material and knowledge access", async () => {
    const pool = await createTestDatabase();
    await pool.query(
      "INSERT INTO classes (id, name) VALUES ('a', 'A'), ('b', 'B')",
    );
    await pool.query(
      `INSERT INTO users
        (id, account_identifier, password_hash, role, class_id)
       VALUES ('teacher-a', 'teacher-a', 'hash', 'teacher', 'a')`,
    );
    const materials = new MaterialRepository(pool);
    const entries = new KnowledgeEntryRepository(pool);
    const material = await materials.create({
      id: "material-a",
      uploaderUserId: "teacher-a",
      classId: "a",
      originalFilename: "lesson.txt",
      storageKey: "stored-a",
      fileType: "txt",
      sizeBytes: 10,
    });
    const [entry] = await entries.createMany(material.id, "a", ["lesson"]);

    await expect(materials.findForClass(material.id, "a")).resolves.not.toBeNull();
    await expect(materials.findForClass(material.id, "b")).resolves.toBeNull();
    await expect(materials.listForClass("b")).resolves.toEqual([]);
    await expect(entries.findForClass(entry.id, "b")).resolves.toBeNull();
    await expect(entries.listForMaterial(material.id, "b")).resolves.toEqual([]);
    await pool.end();
  });
});
