import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { seedAccounts } from "../src/db/seed.js";
import { MaterialRepository, KnowledgeEntryRepository } from "../src/db/repositories.js";
import { createTestDatabase } from "./helpers/database.js";

const config = {
  nodeEnv: "test", host: "127.0.0.1", port: 3000, databaseUrl: "postgresql://unused",
  sessionSecret: "test-session-secret-at-least-32-characters", sessionTtlSeconds: 3600,
  sessionCookieName: "campusclaw_session", sessionCookieSecure: false, uploadMaxBytes: 1024,
  materialStorageRoot: "/tmp/unused", embeddingEndpoint: "http://provider.test/embed",
  embeddingModel: "test-model", embeddingTimeoutMs: 100, embeddingBatchSize: 2,
  searchMaxQueryLength: 100, searchDefaultLimit: 10, searchMaxLimit: 20,
  searchLexicalCandidates: 10, searchVectorCandidates: 10, searchExcerptLength: 100, searchRrfK: 60,
} as const;

describe("knowledge search API", () => {
  let pool: Awaited<ReturnType<typeof createTestDatabase>>;
  let app: Awaited<ReturnType<typeof buildApp>>;
  let teacherCookie: string;
  let studentCookie: string;

  beforeEach(async () => {
    pool = await createTestDatabase();
    await seedAccounts(pool, [
      { accountIdentifier: "teacher-a", password: "teacher-password", role: "teacher", classId: "class-a", className: "Class A" },
      { accountIdentifier: "student-b", password: "student-password", role: "student", classId: "class-b", className: "Class B" },
    ]);
    const users = await pool.query("SELECT id, class_id FROM users ORDER BY class_id");
    const materials = new MaterialRepository(pool);
    const entries = new KnowledgeEntryRepository(pool);
    for (const user of users.rows) {
      const material = await materials.create({ uploaderUserId: user.id, classId: user.class_id, originalFilename: `${user.class_id}.md`, storageKey: `${user.class_id}.md`, fileType: "md", sizeBytes: 1 });
      await entries.createMany(material.id, user.class_id, [user.class_id === "class-a" ? "shared exact lesson" : "shared exact lesson secret B"]);
    }
    app = buildApp({
      config,
      database: pool,
      logger: false,
      embeddingProvider: { model: "test-model", embedQuery: async () => [1, 0], embedDocuments: async () => [[1, 0]] },
    });
    await app.ready();
    const login = async (accountIdentifier: string, password: string) => {
      const response = await app.inject({ method: "POST", url: "/api/login", payload: { accountIdentifier, password } });
      return String(response.headers["set-cookie"]).split(";")[0];
    };
    teacherCookie = await login("teacher-a", "teacher-password");
    studentCookie = await login("student-b", "student-password");
  });

  afterEach(async () => { await app.close(); await pool.end(); });

  it("requires authentication and accepts both roles", async () => {
    expect((await app.inject({ method: "POST", url: "/api/knowledge-search", payload: { query: "lesson" } })).statusCode).toBe(401);
    expect((await app.inject({ method: "POST", url: "/api/knowledge-search", headers: { cookie: teacherCookie }, payload: { query: "lesson" } })).statusCode).toBe(200);
    expect((await app.inject({ method: "POST", url: "/api/knowledge-search", headers: { cookie: studentCookie }, payload: { query: "lesson" } })).statusCode).toBe(200);
  });

  it("ignores forged class claims and excludes class B sources", async () => {
    const response = await app.inject({
      method: "POST", url: "/api/knowledge-search",
      headers: { cookie: teacherCookie, "x-class-id": "class-b" },
      payload: { query: "secret B", classId: "class-b", userId: "student-b", role: "student", materialId: "foreign" },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().results).toEqual([]);
  });

  it("rejects invalid bounds without querying content", async () => {
    for (const query of ["", "   ", "x".repeat(101)]) {
      expect((await app.inject({ method: "POST", url: "/api/knowledge-search", headers: { cookie: teacherCookie }, payload: { query } })).statusCode).toBe(400);
    }
    expect((await app.inject({ method: "POST", url: "/api/knowledge-search", headers: { cookie: teacherCookie }, payload: { query: "lesson", limit: 21 } })).statusCode).toBe(400);
  });
});
