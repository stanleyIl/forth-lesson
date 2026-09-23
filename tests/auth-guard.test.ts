import type { FastifyReply, FastifyRequest } from "fastify";
import { describe, expect, it } from "vitest";

import { requireTeacher } from "../src/auth.js";

describe("teacher role guard", () => {
  it.each([
    ["missing role", undefined],
    [
      "unsupported role",
      { userId: "u", role: "administrator", classId: "a" },
    ],
  ])("returns 403 for %s", async (_case, identity) => {
    let statusCode = 0;
    let body: unknown;
    const reply = {
      status(code: number) {
        statusCode = code;
        return this;
      },
      send(payload: unknown) {
        body = payload;
        return this;
      },
    } as unknown as FastifyReply;
    const request = {
      sessionIdentity: identity,
    } as unknown as FastifyRequest;

    await requireTeacher(request, reply);

    expect(statusCode).toBe(403);
    expect(body).toEqual({ error: "Forbidden" });
  });
});
