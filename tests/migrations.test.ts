import { describe, expect, it } from "vitest";

import { runMigrations } from "../src/db/migrate.js";
import { createTestDatabase } from "./helpers/database.js";

describe("database migrations", () => {
  it("applies cleanly to an empty database", async () => {
    const pool = await createTestDatabase();

    const result = await pool.query(
      "SELECT id FROM schema_migrations ORDER BY id",
    );
    expect(result.rows).toEqual([
      { id: "001_initial_schema" },
      { id: "002_knowledge_retrieval" },
      { id: "003_database_native_retrieval" },
    ]);
    await pool.end();
  });

  it("rejects unsupported roles", async () => {
    const pool = await createTestDatabase();
    await pool.query("INSERT INTO classes (id, name) VALUES ('a', 'Class A')");

    await expect(
      pool.query(
        `INSERT INTO users
          (id, account_identifier, password_hash, role, class_id)
         VALUES ('u', 'user', 'hash', 'administrator', 'a')`,
      ),
    ).rejects.toThrow();
    await pool.end();
  });

  it("rejects broken class and material relationships", async () => {
    const pool = await createTestDatabase();

    await expect(
      pool.query(
        `INSERT INTO users
          (id, account_identifier, password_hash, role, class_id)
         VALUES ('u', 'user', 'hash', 'teacher', 'missing')`,
      ),
    ).rejects.toThrow();

    await pool.query("INSERT INTO classes (id, name) VALUES ('a', 'Class A')");
    await pool.query("INSERT INTO classes (id, name) VALUES ('b', 'Class B')");
    await pool.query(
      `INSERT INTO users
        (id, account_identifier, password_hash, role, class_id)
       VALUES ('teacher-a', 'teacher-a', 'hash', 'teacher', 'a')`,
    );
    await pool.query(
      `INSERT INTO materials
        (id, uploader_user_id, class_id, original_filename, storage_key, file_type, size_bytes)
       VALUES ('material-a', 'teacher-a', 'a', 'lesson.txt', 'stored-a', 'txt', 10)`,
    );

    await expect(
      pool.query(
        `INSERT INTO knowledge_entries
          (id, material_id, class_id, content, sequence_number)
         VALUES ('entry-b', 'material-a', 'b', 'cross class', 0)`,
      ),
    ).rejects.toThrow();
    await pool.end();
  });

  it("enforces non-empty knowledge content", async () => {
    const pool = await createTestDatabase();
    await pool.query("INSERT INTO classes (id, name) VALUES ('a', 'Class A')");
    await pool.query(
      `INSERT INTO users
        (id, account_identifier, password_hash, role, class_id)
       VALUES ('teacher-a', 'teacher-a', 'hash', 'teacher', 'a')`,
    );
    await pool.query(
      `INSERT INTO materials
        (id, uploader_user_id, class_id, original_filename, storage_key, file_type, size_bytes)
       VALUES ('material-a', 'teacher-a', 'a', 'lesson.txt', 'stored-a', 'txt', 10)`,
    );

    await expect(
      pool.query(
        `INSERT INTO knowledge_entries
          (id, material_id, class_id, content, sequence_number)
         VALUES ('entry-a', 'material-a', 'a', '   ', 0)`,
      ),
    ).rejects.toThrow();
    await pool.end();
  });

  it("cascades embedding records when a material is deleted", async () => {
    const pool = await createTestDatabase();
    await pool.query("INSERT INTO classes (id, name) VALUES ('a', 'Class A')");
    await pool.query("INSERT INTO users (id, account_identifier, password_hash, role, class_id) VALUES ('teacher-a', 'teacher-a', 'hash', 'teacher', 'a')");
    await pool.query("INSERT INTO materials (id, uploader_user_id, class_id, original_filename, storage_key, file_type, size_bytes) VALUES ('material-a', 'teacher-a', 'a', 'lesson.txt', 'stored-a', 'txt', 10)");
    await pool.query("INSERT INTO knowledge_entries (id, material_id, class_id, content, search_document, sequence_number) VALUES ('entry-a', 'material-a', 'a', 'content', 'content', 0)");
    await pool.query("INSERT INTO knowledge_entry_embeddings (knowledge_entry_id, class_id, model_identity, embedding_json, status) VALUES ('entry-a', 'a', 'test', '[1]', 'ready')");
    await pool.query("DELETE FROM materials WHERE id = 'material-a' AND class_id = 'a'");
    expect((await pool.query("SELECT * FROM knowledge_entries")).rows).toEqual([]);
    expect((await pool.query("SELECT * FROM knowledge_entry_embeddings")).rows).toEqual([]);
    await pool.end();
  });
});
