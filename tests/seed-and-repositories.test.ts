import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  KnowledgeEntryRepository,
  MaterialRepository,
} from "../src/db/repositories.js";
import { seedAccounts, seedCourseData } from "../src/db/seed.js";
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

  it("deletes only the selected session hash", async () => {
    const pool = await createTestDatabase();
    await pool.query("INSERT INTO classes (id, name) VALUES ('a', 'A')");
    await pool.query("INSERT INTO users (id, account_identifier, password_hash, role, class_id) VALUES ('u', 'u', 'hash', 'teacher', 'a')");
    await pool.query("INSERT INTO sessions (id_hash, user_id, role, class_id, expires_at) VALUES ('one', 'u', 'teacher', 'a', CURRENT_TIMESTAMP + interval '1 hour'), ('two', 'u', 'teacher', 'a', CURRENT_TIMESTAMP + interval '1 hour')");
    const { SessionRepository } = await import("../src/db/repositories.js");
    await new SessionRepository(pool).deleteByIdHash("one");
    expect((await pool.query("SELECT id_hash FROM sessions ORDER BY id_hash")).rows).toEqual([{ id_hash: "two" }]);
    await pool.end();
  });

  it("seeds distinguishable course data idempotently without overwriting uploads", async () => {
    const pool = await createTestDatabase();
    const root = await mkdtemp(path.join(os.tmpdir(), "campusclaw-seed-"));
    await seedAccounts(pool, [
      { accountIdentifier: "teacher-a", password: "teacher", role: "teacher", classId: "class-a", className: "Class A" },
      { accountIdentifier: "student-a", password: "student", role: "student", classId: "class-a", className: "Class A" },
      { accountIdentifier: "teacher-b", password: "teacher", role: "teacher", classId: "class-b", className: "Class B" },
      { accountIdentifier: "student-b", password: "student", role: "student", classId: "class-b", className: "Class B" },
    ]);
    await seedCourseData(pool, root);
    const teacher = await pool.query("SELECT id FROM users WHERE account_identifier='teacher-a'");
    await new MaterialRepository(pool).create({ id: "uploaded", uploaderUserId: teacher.rows[0].id, classId: "class-a", originalFilename: "uploaded.md", storageKey: "uploaded.md", fileType: "md", sizeBytes: 1 });
    await seedCourseData(pool, root);
    expect((await pool.query("SELECT id FROM materials ORDER BY id")).rows).toEqual([
      { id: "seed-material-class-a" }, { id: "seed-material-class-b" }, { id: "uploaded" },
    ]);
    const entries = await pool.query("SELECT class_id, content FROM knowledge_entries WHERE id LIKE 'seed-entry-%' ORDER BY class_id");
    expect(entries.rows[0].content).toContain("Class A");
    expect(entries.rows[1].content).toContain("Class B");
    await pool.end(); await rm(root, { recursive: true, force: true });
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
