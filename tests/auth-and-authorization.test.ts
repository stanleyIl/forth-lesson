import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildApp } from "../src/app.js";
import type { AppConfig } from "../src/config.js";
import {
  KnowledgeEntryRepository,
  MaterialRepository,
} from "../src/db/repositories.js";
import { seedAccounts } from "../src/db/seed.js";
import { createTestDatabase } from "./helpers/database.js";

const config: AppConfig = {
  nodeEnv: "test",
  host: "127.0.0.1",
  port: 3000,
  databaseUrl: "postgresql://unused",
  sessionSecret: "test-session-secret-at-least-32-characters",
  sessionTtlSeconds: 3600,
  sessionCookieName: "campusclaw_session",
  sessionCookieSecure: false,
  uploadMaxBytes: 1024,
  materialStorageRoot: "/tmp/unused",
};

describe("authentication and class authorization", () => {
  let pool: Awaited<ReturnType<typeof createTestDatabase>>;
  let app: FastifyInstance;
  let teacherCookie: string;
  let studentCookie: string;
  let classAMaterialId: string;
  let classAEntryId: string;

  async function login(accountIdentifier: string, password: string) {
    const response = await app.inject({
      method: "POST",
      url: "/api/login",
      payload: { accountIdentifier, password },
    });
    expect(response.statusCode).toBe(200);
    const cookie = response.headers["set-cookie"];
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    return String(cookie).split(";")[0];
  }

  beforeEach(async () => {
    pool = await createTestDatabase();
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
    const teacher = await pool.query(
      "SELECT id FROM users WHERE account_identifier = 'teacher-a'",
    );
    const materials = new MaterialRepository(pool);
    const material = await materials.create({
      uploaderUserId: teacher.rows[0].id,
      classId: "class-a",
      originalFilename: "lesson.txt",
      storageKey: "stored-lesson",
      fileType: "txt",
      sizeBytes: 6,
    });
    classAMaterialId = material.id;
    const entries = new KnowledgeEntryRepository(pool);
    const [entry] = await entries.createMany(material.id, "class-a", ["lesson"]);
    classAEntryId = entry.id;

    app = buildApp({ config, database: pool, logger: false });
    await app.ready();
    teacherCookie = await login("teacher-a", "teacher-password");
    studentCookie = await login("student-b", "student-password");
  });

  afterEach(async () => {
    await app.close();
    await pool.end();
  });

  it("logs in teachers and students with opaque server-side sessions", async () => {
    expect(teacherCookie).toMatch(/^campusclaw_session=[A-Za-z0-9_-]{40,}$/);
    expect(studentCookie).toMatch(/^campusclaw_session=[A-Za-z0-9_-]{40,}$/);
    const stored = await pool.query("SELECT id_hash FROM sessions");
    expect(stored.rows).toHaveLength(2);
    expect(JSON.stringify(stored.rows)).not.toContain(
      teacherCookie.split("=")[1],
    );
  });

  it("restores trusted identity through /api/me", async () => {
    const teacher = await app.inject({ url: "/api/me", headers: { cookie: teacherCookie } });
    const student = await app.inject({ url: "/api/me", headers: { cookie: studentCookie } });
    expect(teacher.statusCode).toBe(200);
    expect(teacher.json().user).toMatchObject({ role: "teacher", classId: "class-a" });
    expect(student.json().user).toMatchObject({ role: "student", classId: "class-b" });
    expect((await app.inject({ url: "/api/me" })).statusCode).toBe(401);
  });

  it("revokes the server-side session on logout", async () => {
    const response = await app.inject({ method: "POST", url: "/api/logout", headers: { cookie: teacherCookie } });
    expect(response.statusCode).toBe(200);
    expect(response.headers["set-cookie"]).toContain("campusclaw_session=");
    expect((await app.inject({ url: "/api/me", headers: { cookie: teacherCookie } })).statusCode).toBe(401);
  });

  it.each([
    ["unknown account", "missing", "teacher-password"],
    ["wrong password", "teacher-a", "wrong-password"],
  ])("returns the same 401 for %s", async (_case, accountIdentifier, password) => {
    const response = await app.inject({
      method: "POST",
      url: "/api/login",
      payload: { accountIdentifier, password },
    });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: "Invalid credentials" });
    expect(response.headers["set-cookie"]).toBeUndefined();
  });

  it("rejects missing, invalid, expired, and tampered sessions", async () => {
    expect((await app.inject({ url: "/api/materials" })).statusCode).toBe(401);
    for (const cookie of [
      "campusclaw_session=invalid",
      `${teacherCookie}tampered`,
    ]) {
      expect(
        (
          await app.inject({
            url: "/api/materials",
            headers: { cookie },
          })
        ).statusCode,
      ).toBe(401);
    }
    await pool.query("UPDATE sessions SET expires_at = CURRENT_TIMESTAMP");
    expect(
      (
        await app.inject({
          url: "/api/materials",
          headers: { cookie: teacherCookie },
        })
      ).statusCode,
    ).toBe(401);
  });

  it("redirects unauthenticated browser pages but leaves login public", async () => {
    const protectedPage = await app.inject({ url: "/app/materials" });
    expect(protectedPage.statusCode).toBe(302);
    expect(protectedPage.headers.location).toBe("/login");
    expect(protectedPage.body).not.toContain("<title>Materials</title>");
    const login = await app.inject({ url: "/login" });
    expect(login.statusCode).toBe(200);
    expect(login.body).not.toContain("search-form");
    const materials = await app.inject({ url: "/app/materials", headers: { cookie: teacherCookie } });
    expect(materials.body).toContain("search-form");
  });

  it("ignores forged identity, role, and class claims", async () => {
    const response = await app.inject({
      method: "GET",
      url: `/api/materials/${classAMaterialId}?class_id=class-a&role=teacher`,
      headers: {
        cookie: studentCookie,
        "x-class-id": "class-a",
        "x-user-id": "forged",
        "x-role": "teacher",
      },
    });
    expect(response.statusCode).toBe(404);
  });

  it("lists and reads only the trusted session class", async () => {
    const teacherList = await app.inject({
      url: "/api/materials",
      headers: { cookie: teacherCookie },
    });
    expect(teacherList.statusCode).toBe(200);
    expect(teacherList.json().materials).toHaveLength(1);
    expect(teacherList.body).not.toContain("storage_key");
    expect(teacherList.body).not.toContain("stored-lesson");

    const studentList = await app.inject({
      url: "/api/materials?class_id=class-a",
      headers: { cookie: studentCookie, "x-class-id": "class-a" },
    });
    expect(studentList.statusCode).toBe(200);
    expect(studentList.json().materials).toEqual([]);

    const crossClass = await app.inject({
      url: `/api/materials/${classAMaterialId}`,
      headers: { cookie: studentCookie },
    });
    expect(crossClass.statusCode).toBe(404);
    expect(crossClass.body).not.toContain("lesson.txt");
  });

  it("applies the same 404 isolation to knowledge entries", async () => {
    const sameClass = await app.inject({
      url: `/api/knowledge-entries/${classAEntryId}`,
      headers: { cookie: teacherCookie },
    });
    expect(sameClass.statusCode).toBe(200);
    expect(sameClass.json().knowledgeEntry.content).toBe("lesson");

    const crossClass = await app.inject({
      url: `/api/knowledge-entries/${classAEntryId}`,
      headers: { cookie: studentCookie },
    });
    expect(crossClass.statusCode).toBe(404);
    expect(crossClass.body).not.toContain("lesson");
  });
});
