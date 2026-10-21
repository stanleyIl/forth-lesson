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
  JWT_SECRET: "a-secure-jwt-secret-with-at-least-32-chars",
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
      embeddingEndpoint: "http://127.0.0.1:11434/v1/embeddings",
      embeddingApiKey: undefined,
      embeddingModel: "text-embedding-3-small",
      embeddingTimeoutMs: 5000,
      embeddingBatchSize: 32,
      searchMaxQueryLength: 1000,
      searchDefaultLimit: 10,
      searchMaxLimit: 50,
      searchLexicalCandidates: 50,
      searchVectorCandidates: 50,
      searchExcerptLength: 240,
      searchRrfK: 60,
      jwtSecret: validEnvironment.JWT_SECRET,
      jwtIssuer: "campusclaw",
      jwtAudience: "campusclaw-browser",
      jwtTtlSeconds: 3600,
      chatEndpoint: "http://127.0.0.1:11434/v1/chat/completions",
      chatApiKey: undefined,
      chatModel: "campusclaw-chat",
      chatTimeoutMs: 30000,
      chatMaxTokens: 600,
      askMaxQuestionLength: 2000,
      conversationHistoryMessages: 12,
      conversationHistoryChars: 12000,
      chunkMaxChars: 800,
      chunkOverlapChars: 80,
      vectorSimilarityThreshold: 0.35,
    });
  });

  it.each([
    ["invalid database URL", { DATABASE_URL: "not a URL" }],
    ["invalid port", { PORT: "70000" }],
    ["invalid upload limit", { UPLOAD_MAX_BYTES: "zero" }],
    ["invalid HTTPS flag", { HTTPS_ENABLED: "sometimes" }],
    ["short session secret", { SESSION_SECRET: "too-short" }],
    ["short JWT secret", { JWT_SECRET: "too-short" }],
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
