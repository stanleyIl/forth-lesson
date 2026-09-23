import { PassThrough } from "node:stream";

import pino from "pino";
import { describe, expect, it } from "vitest";

import { safeLoggerOptions } from "../src/logging.js";

describe("safe logging", () => {
  it("does not emit credentials, secrets, cookies, or uploaded content", async () => {
    const output = new PassThrough();
    let captured = "";
    output.on("data", (chunk) => {
      captured += chunk.toString();
    });

    const logger = pino(safeLoggerOptions, output);
    logger.error(
      {
        password: "plain-password",
        passwordHash: "encoded-password-hash",
        sessionId: "opaque-session-id",
        sessionSecret: "server-session-secret",
        content: "private uploaded lesson",
        req: {
          method: "POST",
          url: "/materials",
          headers: {
            cookie: "campusclaw_session=secret-cookie",
            authorization: "Bearer secret-token",
          },
        },
        err: Object.assign(new Error("failure containing plain-password"), {
          code: "E_TEST",
        }),
      },
      "safe failure",
    );

    await new Promise<void>((resolve) => output.end(resolve));

    for (const sensitiveValue of [
      "plain-password",
      "encoded-password-hash",
      "opaque-session-id",
      "server-session-secret",
      "private uploaded lesson",
      "secret-cookie",
      "secret-token",
    ]) {
      expect(captured).not.toContain(sensitiveValue);
    }
    expect(captured).toContain("safe failure");
    expect(captured).toContain("E_TEST");
  });
});
