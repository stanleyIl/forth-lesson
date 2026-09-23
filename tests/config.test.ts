import { describe, expect, it } from "vitest";

import { ConfigurationError, loadConfig } from "../src/config.js";

const validEnvironment: NodeJS.ProcessEnv = {
  NODE_ENV: "test",
  HOST: "127.0.0.1",
  PORT: "3100",
  DATABASE_URL: "postgresql://campusclaw:secret@localhost:5432/campusclaw",
  SESSION_SECRET: "a-secure-session-secret-with-32-chars",
  SESSION_TTL_SECONDS: "3600",
  SESSION_COOKIE_NAME: "test_session",
  HTTPS_ENABLED: "true",
  UPLOAD_MAX_BYTES: "2048",
  MATERIAL_STORAGE_ROOT: "/tmp/campusclaw-materials",
};

describe("loadConfig", () => {
  it("loads and types valid configuration values", () => {
    expect(loadConfig(validEnvironment)).toEqual({
      nodeEnv: "test",
      host: "127.0.0.1",
      port: 3100,
      databaseUrl: validEnvironment.DATABASE_URL,
      sessionSecret: validEnvironment.SESSION_SECRET,
      sessionTtlSeconds: 3600,
      sessionCookieName: "test_session",
      sessionCookieSecure: true,
      uploadMaxBytes: 2048,
      materialStorageRoot: "/tmp/campusclaw-materials",
    });
  });

  it.each([
    ["invalid database URL", { DATABASE_URL: "not a URL" }],
    ["invalid port", { PORT: "70000" }],
    ["invalid upload limit", { UPLOAD_MAX_BYTES: "zero" }],
    ["invalid HTTPS flag", { HTTPS_ENABLED: "sometimes" }],
    ["short session secret", { SESSION_SECRET: "too-short" }],
  ])("rejects %s", (_description, overrides) => {
    expect(() => loadConfig({ ...validEnvironment, ...overrides })).toThrow(
      ConfigurationError,
    );
  });

  it("fails closed when SESSION_SECRET is missing", () => {
    const { SESSION_SECRET: _omitted, ...withoutSecret } = validEnvironment;

    expect(() => loadConfig(withoutSecret)).toThrow(/SESSION_SECRET/);
  });
});
