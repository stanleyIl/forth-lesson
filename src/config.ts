import { z } from "zod";

const booleanFromString = z
  .enum(["true", "false"])
  .default("false")
  .transform((value) => value === "true");

const positiveIntegerFromString = (defaultValue?: string) => {
  if (defaultValue === undefined) {
    return z
      .string()
      .regex(/^[1-9]\d*$/)
      .transform((value) => Number.parseInt(value, 10))
      .pipe(z.number().int().positive());
  }

  return z
    .string()
    .regex(/^[1-9]\d*$/)
    .default(defaultValue)
    .transform((value) => Number.parseInt(value, 10))
    .pipe(z.number().int().positive());
};

const environmentSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  HOST: z.string().min(1).default("0.0.0.0"),
  PORT: positiveIntegerFromString("3000").pipe(z.number().max(65535)),
  DATABASE_URL: z.string().url(),
  SESSION_SECRET: z.string().min(32, "SESSION_SECRET must contain at least 32 characters"),
  SESSION_TTL_SECONDS: positiveIntegerFromString("86400"),
  SESSION_COOKIE_NAME: z.string().regex(/^[A-Za-z0-9_-]+$/).default("campusclaw_session"),
  HTTPS_ENABLED: booleanFromString,
  UPLOAD_MAX_BYTES: positiveIntegerFromString("1048576"),
  MATERIAL_STORAGE_ROOT: z.string().min(1),
  EMBEDDING_ENDPOINT: z.string().url().default("http://127.0.0.1:11434/v1/embeddings"),
  EMBEDDING_API_KEY: z.string().optional(),
  EMBEDDING_MODEL: z.string().min(1).default("text-embedding-3-small"),
  EMBEDDING_TIMEOUT_MS: positiveIntegerFromString("5000").pipe(z.number().max(120000)),
  EMBEDDING_BATCH_SIZE: positiveIntegerFromString("32").pipe(z.number().max(256)),
  SEARCH_MAX_QUERY_LENGTH: positiveIntegerFromString("1000").pipe(z.number().max(10000)),
  SEARCH_DEFAULT_LIMIT: positiveIntegerFromString("10").pipe(z.number().max(100)),
  SEARCH_MAX_LIMIT: positiveIntegerFromString("50").pipe(z.number().max(100)),
  SEARCH_LEXICAL_CANDIDATES: positiveIntegerFromString("50").pipe(z.number().max(500)),
  SEARCH_VECTOR_CANDIDATES: positiveIntegerFromString("50").pipe(z.number().max(500)),
  SEARCH_EXCERPT_LENGTH: positiveIntegerFromString("240").pipe(z.number().max(2000)),
  SEARCH_RRF_K: positiveIntegerFromString("60").pipe(z.number().max(1000)),
});

export type AppConfig = {
  nodeEnv: "development" | "test" | "production";
  host: string;
  port: number;
  databaseUrl: string;
  sessionSecret: string;
  sessionTtlSeconds: number;
  sessionCookieName: string;
  sessionCookieSecure: boolean;
  uploadMaxBytes: number;
  materialStorageRoot: string;
  embeddingEndpoint: string;
  embeddingApiKey?: string;
  embeddingModel: string;
  embeddingTimeoutMs: number;
  embeddingBatchSize: number;
  searchMaxQueryLength: number;
  searchDefaultLimit: number;
  searchMaxLimit: number;
  searchLexicalCandidates: number;
  searchVectorCandidates: number;
  searchExcerptLength: number;
  searchRrfK: number;
};

export class ConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigurationError";
  }
}

export function loadConfig(environment: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = environmentSchema.safeParse(environment);

  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join(".") || "environment"}: ${issue.message}`)
      .join("; ");
    throw new ConfigurationError(`Invalid runtime configuration: ${details}`);
  }

  if (parsed.data.SEARCH_DEFAULT_LIMIT > parsed.data.SEARCH_MAX_LIMIT) {
    throw new ConfigurationError("Invalid runtime configuration: SEARCH_DEFAULT_LIMIT must not exceed SEARCH_MAX_LIMIT");
  }
  return {
    nodeEnv: parsed.data.NODE_ENV,
    host: parsed.data.HOST,
    port: parsed.data.PORT,
    databaseUrl: parsed.data.DATABASE_URL,
    sessionSecret: parsed.data.SESSION_SECRET,
    sessionTtlSeconds: parsed.data.SESSION_TTL_SECONDS,
    sessionCookieName: parsed.data.SESSION_COOKIE_NAME,
    sessionCookieSecure: parsed.data.HTTPS_ENABLED,
    uploadMaxBytes: parsed.data.UPLOAD_MAX_BYTES,
    materialStorageRoot: parsed.data.MATERIAL_STORAGE_ROOT,
    embeddingEndpoint: parsed.data.EMBEDDING_ENDPOINT,
    embeddingApiKey: parsed.data.EMBEDDING_API_KEY,
    embeddingModel: parsed.data.EMBEDDING_MODEL,
    embeddingTimeoutMs: parsed.data.EMBEDDING_TIMEOUT_MS,
    embeddingBatchSize: parsed.data.EMBEDDING_BATCH_SIZE,
    searchMaxQueryLength: parsed.data.SEARCH_MAX_QUERY_LENGTH,
    searchDefaultLimit: parsed.data.SEARCH_DEFAULT_LIMIT,
    searchMaxLimit: parsed.data.SEARCH_MAX_LIMIT,
    searchLexicalCandidates: parsed.data.SEARCH_LEXICAL_CANDIDATES,
    searchVectorCandidates: parsed.data.SEARCH_VECTOR_CANDIDATES,
    searchExcerptLength: parsed.data.SEARCH_EXCERPT_LENGTH,
    searchRrfK: parsed.data.SEARCH_RRF_K,
  };
}
