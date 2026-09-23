import { describe, expect, it } from "vitest";

import { buildApp } from "../src/app.js";
import type { AppConfig } from "../src/config.js";
import { createTestDatabase } from "./helpers/database.js";

describe("GET /health", () => {
  it("returns exact unauthenticated liveness JSON", async () => {
    const pool = await createTestDatabase();
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
    const app = buildApp({ config, database: pool, logger: false });
    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("application/json");
    expect(response.json()).toEqual({ status: "ok" });

    await app.close();
    await pool.end();
  });

  it("does not expose health on a different method", async () => {
    const pool = await createTestDatabase();
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
    const app = buildApp({ config, database: pool, logger: false });
    expect(
      (await app.inject({ method: "POST", url: "/health" })).statusCode,
    ).toBe(404);
    await app.close();
    await pool.end();
  });
});
