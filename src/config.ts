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
  };
}
