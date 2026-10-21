import type {
  FastifyReply,
  FastifyRequest,
  preHandlerHookHandler,
} from "fastify";

import type { AppConfig } from "./config.js";
import type { SessionIdentity } from "./db/repositories.js";
import type { SessionService } from "./security/sessions.js";
import { bearerToken, type AccessTokenService } from "./security/tokens.js";

declare module "fastify" {
  interface FastifyRequest {
    sessionIdentity?: SessionIdentity;
    authenticationKind?: "cookie" | "bearer";
    bearerAccessToken?: string;
  }
}

export function createAuthenticationGuard(
  sessions: SessionService,
  config: AppConfig,
  mode: "api" | "browser" = "api",
  tokens?: AccessTokenService,
): preHandlerHookHandler {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const authorization = request.headers.authorization;
    let identity: SessionIdentity | null = null;
    if (authorization !== undefined) {
      const token = bearerToken(authorization);
      if (token && tokens) {
        identity = await tokens.authenticate(token);
        if (identity) {
          request.authenticationKind = "bearer";
          request.bearerAccessToken = token;
        }
      }
    } else {
      identity = await sessions.authenticate(request.cookies[config.sessionCookieName]);
      if (identity) request.authenticationKind = "cookie";
    }
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
