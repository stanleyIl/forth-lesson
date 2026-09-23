import type { LoggerOptions } from "pino";

const redactedPaths = [
  "password",
  "*.password",
  "passwordHash",
  "*.passwordHash",
  "sessionId",
  "*.sessionId",
  "sessionSecret",
  "*.sessionSecret",
  "secret",
  "*.secret",
  "cookie",
  "*.cookie",
  "authorization",
  "*.authorization",
  "content",
  "*.content",
  "file",
  "*.file",
  "buffer",
  "*.buffer",
  "query",
  "*.query",
  "excerpt",
  "*.excerpt",
  "vector",
  "*.vector",
  "embedding",
  "*.embedding",
  "req.headers.cookie",
  "req.headers.authorization",
];

export const safeLoggerOptions: LoggerOptions = {
  level: process.env.LOG_LEVEL ?? "info",
  redact: {
    paths: redactedPaths,
    remove: true,
  },
  serializers: {
    req(request: {
      method?: string;
      url?: string;
      hostname?: string;
      remoteAddress?: string;
    }) {
      return {
        method: request.method,
        url: request.url,
        hostname: request.hostname,
        remoteAddress: request.remoteAddress,
      };
    },
    res(response: { statusCode?: number }) {
      return { statusCode: response.statusCode };
    },
    err(error: Error & { code?: string }) {
      return {
        type: error.name,
        code: error.code,
      };
    },
  },
};
