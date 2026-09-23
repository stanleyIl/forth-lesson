import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { MaterialRepository } from "../src/db/repositories.js";
import { seedAccounts } from "../src/db/seed.js";
import { FileMaterialStorage } from "../src/materials/storage.js";
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

describe("protected material download", () => {
  let pool: Awaited<ReturnType<typeof createTestDatabase>>;
  let root: string;
  let app: ReturnType<typeof buildApp>;
  let materialId: string;
  let storage: FileMaterialStorage;
  const cookies: Record<string, string> = {};

  beforeEach(async () => {
    pool = await createTestDatabase(); root = await mkdtemp(path.join(os.tmpdir(), "campusclaw-download-"));
    await seedAccounts(pool, [
      { accountIdentifier: "teacher-a", password: "teacher", role: "teacher", classId: "a", className: "A" },
      { accountIdentifier: "student-a", password: "student", role: "student", classId: "a", className: "A" },
      { accountIdentifier: "student-b", password: "student", role: "student", classId: "b", className: "B" },
    ]);
    storage = new FileMaterialStorage(root); const stored = await storage.write(Buffer.from("download body"), "md");
    const teacher = await pool.query("SELECT id FROM users WHERE account_identifier='teacher-a'");
    materialId = (await new MaterialRepository(pool).create({ uploaderUserId: teacher.rows[0].id, classId: "a", originalFilename: "lesson.md", storageKey: stored.storageKey, fileType: "md", sizeBytes: 13 })).id;
    app = buildApp({ config, database: pool, materialStorage: storage, logger: false, embeddingProvider: { model: "test", embedQuery: async()=>[1], embedDocuments: async()=>[[1]] } });
    await app.ready();
    for (const [account, password] of [["teacher-a", "teacher"], ["student-a", "student"], ["student-b", "student"]]) {
      const response = await app.inject({ method: "POST", url: "/api/login", payload: { accountIdentifier: account, password } });
      cookies[account] = String(response.headers["set-cookie"]).split(";")[0];
    }
  });

  afterEach(async () => { await app.close(); await pool.end(); await rm(root, { recursive: true, force: true }); });

  it("allows same-class teacher and student downloads", async () => {
    for (const account of ["teacher-a", "student-a"]) {
      const response = await app.inject({ url: `/api/materials/${materialId}/file`, headers: { cookie: cookies[account] } });
      expect(response.statusCode).toBe(200); expect(response.body).toBe("download body"); expect(response.headers["content-disposition"]).toContain("lesson.md");
    }
  });

  it("returns identical 404 for foreign and missing files", async () => {
    const foreign = await app.inject({ url: `/api/materials/${materialId}/file`, headers: { cookie: cookies["student-b"] } });
    const missing = await app.inject({ url: "/api/materials/missing/file", headers: { cookie: cookies["student-b"] } });
    expect(foreign.statusCode).toBe(404); expect(foreign.body).toBe(missing.body); expect(foreign.body).not.toContain("lesson.md");
  });

  it("rejects unauthenticated download and storage traversal", async () => {
    expect((await app.inject({ url: `/api/materials/${materialId}/file` })).statusCode).toBe(401);
    await expect(new FileMaterialStorage(root).read("../secret.txt")).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("returns a generic 503 for an authorized storage failure", async () => {
    storage.read = async () => { throw Object.assign(new Error("private disk detail"), { code: "EIO" }); };
    const response = await app.inject({ url: `/api/materials/${materialId}/file`, headers: { cookie: cookies["teacher-a"] } });
    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ error: "Material unavailable" });
    expect(response.body).not.toContain("private disk detail");
    expect(response.body).not.toContain(root);
  });
});
