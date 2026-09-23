import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import type { FastifyInstance } from "fastify";
import { afterEach, describe, expect, it } from "vitest";

import { buildApp } from "../src/app.js";
import type { AppConfig } from "../src/config.js";
import { seedAccounts } from "../src/db/seed.js";
import { MaterialError } from "../src/materials/errors.js";
import { MaterialIngestionService } from "../src/materials/ingestion.js";
import { parseMaterialText } from "../src/materials/parser.js";
import {
  FileMaterialStorage,
  type MaterialStorage,
} from "../src/materials/storage.js";
import { validateMaterial } from "../src/materials/validation.js";
import { createTestDatabase } from "./helpers/database.js";

const temporaryRoots: string[] = [];

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "campusclaw-"));
  temporaryRoots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) =>
      rm(root, { recursive: true, force: true }),
    ),
  );
});

function multipartPayload(
  filename: string,
  content: Buffer,
  fields: Record<string, string> = {},
) {
  const boundary = "----campusclaw-test-boundary";
  const chunks: Buffer[] = [];
  for (const [name, value] of Object.entries(fields)) {
    chunks.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`,
      ),
    );
  }
  chunks.push(
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: application/octet-stream\r\n\r\n`,
    ),
    content,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  );
  return {
    payload: Buffer.concat(chunks),
    headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
  };
}

describe("material validation, storage, and parsing", () => {
  it.each([
    ["lesson.txt", "plain text"],
    ["lesson.md", "# Markdown"],
  ])("accepts valid %s UTF-8 content", (filename, content) => {
    const validated = validateMaterial({
      filename,
      bytes: Buffer.from(content),
      maxBytes: 1024,
    });
    expect(validated.text).toBe(content);
  });

  it.each([
    ["lesson.pdf", Buffer.from("data"), 415],
    ["lesson.txt", Buffer.alloc(0), 400],
    ["lesson.md", Buffer.from([0xff, 0xfe]), 400],
    ["lesson.txt", Buffer.from("too large"), 413, 2],
  ])(
    "rejects invalid upload %s with %i semantics",
    (filename, bytes, statusCode, maxBytes = 1024) => {
      try {
        validateMaterial({ filename, bytes, maxBytes });
        throw new Error("expected validation failure");
      } catch (error) {
        expect(error).toBeInstanceOf(MaterialError);
        expect((error as MaterialError).statusCode).toBe(statusCode);
      }
    },
  );

  it("preserves Markdown text and rejects whitespace-only parser output", () => {
    expect(parseMaterialText("# Title\n\n- item", "md")).toEqual([
      "# Title\n\n- item",
    ]);
    expect(() => parseMaterialText(" \n\t ", "txt")).toThrow(MaterialError);
  });

  it("uses a server-generated path even for an unsafe original filename", async () => {
    const root = await temporaryRoot();
    const storage = new FileMaterialStorage(root);
    const stored = await storage.write(Buffer.from("lesson"), "txt");

    expect(path.dirname(stored.absolutePath)).toBe(root);
    expect(stored.storageKey).not.toContain("..");
    expect(await readFile(stored.absolutePath, "utf8")).toBe("lesson");
  });
});

describe("atomic material ingestion", () => {
  it("retains an unsafe original filename only as metadata", async () => {
    const pool = await createTestDatabase();
    await pool.query("INSERT INTO classes (id, name) VALUES ('a', 'A')");
    await pool.query(
      `INSERT INTO users
        (id, account_identifier, password_hash, role, class_id)
       VALUES ('teacher-a', 'teacher-a', 'hash', 'teacher', 'a')`,
    );
    const root = await temporaryRoot();
    const service = new MaterialIngestionService(
      pool,
      new FileMaterialStorage(root),
      parseMaterialText,
      1024,
    );
    const material = await service.ingest({
      filename: "../../lesson.txt",
      bytes: Buffer.from("lesson"),
      uploaderUserId: "teacher-a",
      classId: "a",
    });

    expect(material.original_filename).toBe("../../lesson.txt");
    expect(material.storage_key).not.toContain("..");
    expect(await readdir(root)).toEqual([material.storage_key]);
    await pool.end();
  });

  it("persists one file, one material, and linked class-scoped entries", async () => {
    const pool = await createTestDatabase();
    await pool.query("INSERT INTO classes (id, name) VALUES ('a', 'A')");
    await pool.query(
      `INSERT INTO users
        (id, account_identifier, password_hash, role, class_id)
       VALUES ('teacher-a', 'teacher-a', 'hash', 'teacher', 'a')`,
    );
    const root = await temporaryRoot();
    const service = new MaterialIngestionService(
      pool,
      new FileMaterialStorage(root),
      parseMaterialText,
      1024,
    );

    const material = await service.ingest({
      filename: "lesson.md",
      bytes: Buffer.from("# Lesson"),
      uploaderUserId: "teacher-a",
      classId: "a",
    });

    expect(await readdir(root)).toEqual([material.storage_key]);
    const records = await pool.query(
      `SELECT m.id, m.class_id, k.material_id, k.class_id AS entry_class_id,
              k.content
       FROM materials m JOIN knowledge_entries k ON k.material_id = m.id`,
    );
    expect(records.rows).toEqual([
      {
        id: material.id,
        class_id: "a",
        material_id: material.id,
        entry_class_id: "a",
        content: "# Lesson",
      },
    ]);
    await pool.end();
  });

  it("creates no records when storage fails", async () => {
    const pool = await createTestDatabase();
    const failingStorage: MaterialStorage = {
      write: async () => {
        throw new Error("disk unavailable");
      },
      removeOrQuarantine: async () => undefined,
    };
    const service = new MaterialIngestionService(
      pool,
      failingStorage,
      parseMaterialText,
      1024,
    );
    await expect(
      service.ingest({
        filename: "lesson.txt",
        bytes: Buffer.from("lesson"),
        uploaderUserId: "missing",
        classId: "missing",
      }),
    ).rejects.toThrow("disk unavailable");
    expect((await pool.query("SELECT * FROM materials")).rows).toEqual([]);
    expect((await pool.query("SELECT * FROM knowledge_entries")).rows).toEqual([]);
    await pool.end();
  });

  it("removes the file and rolls back when parsing or database work fails", async () => {
    const pool = await createTestDatabase();
    const root = await temporaryRoot();
    const storage = new FileMaterialStorage(root);
    const parserFailure = new MaterialIngestionService(
      pool,
      storage,
      () => {
        throw new Error("parser failed");
      },
      1024,
    );
    await expect(
      parserFailure.ingest({
        filename: "lesson.txt",
        bytes: Buffer.from("lesson"),
        uploaderUserId: "missing",
        classId: "missing",
      }),
    ).rejects.toThrow("parser failed");
    expect(await readdir(root)).toEqual([]);

    const databaseFailure = new MaterialIngestionService(
      pool,
      storage,
      parseMaterialText,
      1024,
    );
    await expect(
      databaseFailure.ingest({
        filename: "lesson.txt",
        bytes: Buffer.from("lesson"),
        uploaderUserId: "missing",
        classId: "missing",
      }),
    ).rejects.toThrow();
    expect(await readdir(root)).toEqual([]);
    expect((await pool.query("SELECT * FROM materials")).rows).toEqual([]);
    await pool.end();
  });
});

describe("teacher upload API", () => {
  async function setup() {
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
    const root = await temporaryRoot();
    const config: AppConfig = {
      nodeEnv: "test",
      host: "127.0.0.1",
      port: 3000,
      databaseUrl: "postgresql://unused",
      sessionSecret: "test-session-secret-at-least-32-characters",
      sessionTtlSeconds: 3600,
      sessionCookieName: "campusclaw_session",
      sessionCookieSecure: false,
      uploadMaxBytes: 64,
      materialStorageRoot: root,
    };
    const app = buildApp({ config, database: pool, logger: false });
    await app.ready();
    return { pool, app, root };
  }

  async function login(
    app: FastifyInstance,
    accountIdentifier: string,
    password: string,
  ) {
    const response = await app.inject({
      method: "POST",
      url: "/api/login",
      payload: { accountIdentifier, password },
    });
    return String(response.headers["set-cookie"]).split(";")[0];
  }

  it("returns 401 unauthenticated and 403 for a direct student upload", async () => {
    const { app, pool, root } = await setup();
    const upload = multipartPayload("lesson.txt", Buffer.from("lesson"));
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/materials",
          ...upload,
        })
      ).statusCode,
    ).toBe(401);
    const studentCookie = await login(app, "student-b", "student-password");
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/materials",
          ...upload,
          headers: { ...upload.headers, cookie: studentCookie },
        })
      ).statusCode,
    ).toBe(403);
    expect((await pool.query("SELECT * FROM materials")).rows).toEqual([]);
    expect(await readdir(root)).toEqual([]);
    await app.close();
    await pool.end();
  });

  it.each([
    ["lesson.txt", "plain lesson"],
    ["lesson.md", "# Markdown lesson"],
  ])("accepts teacher %s uploads and ignores foreign class_id", async (filename, content) => {
    const { app, pool } = await setup();
    const teacherCookie = await login(app, "teacher-a", "teacher-password");
    const upload = multipartPayload(filename, Buffer.from(content), {
      class_id: "class-b",
    });
    const response = await app.inject({
      method: "POST",
      url: "/api/materials",
      ...upload,
      headers: { ...upload.headers, cookie: teacherCookie },
    });
    expect(response.statusCode).toBe(201);
    const records = await pool.query(
      `SELECT m.class_id, k.class_id AS entry_class_id, k.content
       FROM materials m JOIN knowledge_entries k ON k.material_id = m.id`,
    );
    expect(records.rows).toEqual([
      {
        class_id: "class-a",
        entry_class_id: "class-a",
        content,
      },
    ]);
    await app.close();
    await pool.end();
  });

  it.each([
    ["lesson.pdf", Buffer.from("pdf"), 415],
    ["lesson.txt", Buffer.alloc(0), 400],
    ["lesson.txt", Buffer.from([0xff]), 400],
    ["lesson.txt", Buffer.alloc(65, 1), 413],
  ])("rejects invalid teacher upload %s", async (filename, content, statusCode) => {
    const { app, pool, root } = await setup();
    const teacherCookie = await login(app, "teacher-a", "teacher-password");
    const upload = multipartPayload(filename, content);
    const response = await app.inject({
      method: "POST",
      url: "/api/materials",
      ...upload,
      headers: { ...upload.headers, cookie: teacherCookie },
    });
    expect(response.statusCode).toBe(statusCode);
    expect((await pool.query("SELECT * FROM materials")).rows).toEqual([]);
    expect(await readdir(root)).toEqual([]);
    await app.close();
    await pool.end();
  });
});
