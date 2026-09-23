import type {
  FastifyReply,
  FastifyRequest,
  preHandlerHookHandler,
} from "fastify";

import type { AppConfig } from "./config.js";
import type { SessionIdentity } from "./db/repositories.js";
import type { SessionService } from "./security/sessions.js";

declare module "fastify" {
  interface FastifyRequest {
    sessionIdentity?: SessionIdentity;
  }
}

export function createAuthenticationGuard(
  sessions: SessionService,
  config: AppConfig,
  mode: "api" | "browser" = "api",
): preHandlerHookHandler {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const identity = await sessions.authenticate(
      request.cookies[config.sessionCookieName],
    );
    if (!identity) {
      if (mode === "browser") {
        return reply.redirect("/login");
      }
      return reply.status(401).send({ error: "Authentication required" });
    }
    request.sessionIdentity = identity;
  };
}

export async function requireTeacher(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<unknown> {
  if (request.sessionIdentity?.role !== "teacher") {
    return reply.status(403).send({ error: "Forbidden" });
  }
}
