import { createHmac, randomUUID } from "node:crypto";

import { jwtVerify, SignJWT } from "jose";

import { AccessTokenSessionRepository, type SessionIdentity } from "../db/repositories.js";

export class AccessTokenService {
  private readonly key: Uint8Array;

  constructor(
    private readonly repository: AccessTokenSessionRepository,
    private readonly options: { secret: string; issuer: string; audience: string; ttlSeconds: number },
  ) {
    this.key = new TextEncoder().encode(options.secret);
  }

  private hashJti(jti: string): string {
    return createHmac("sha256", this.options.secret).update(jti).digest("base64url");
  }

  async create(identity: SessionIdentity): Promise<{ token: string; expiresAt: Date }> {
    const jti = randomUUID();
    const expiresAt = new Date(Date.now() + this.options.ttlSeconds * 1000);
    await this.repository.create({ jtiHash: this.hashJti(jti), userId: identity.userId, expiresAt });
    const token = await new SignJWT({ role: identity.role, class_id: identity.classId })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setSubject(identity.userId)
      .setJti(jti)
      .setIssuer(this.options.issuer)
      .setAudience(this.options.audience)
      .setIssuedAt()
      .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
      .sign(this.key);
    return { token, expiresAt };
  }

  async authenticate(token: string): Promise<SessionIdentity | null> {
    try {
      const verified = await jwtVerify(token, this.key, {
        algorithms: ["HS256"],
        issuer: this.options.issuer,
        audience: this.options.audience,
      });
      const { payload } = verified;
      if (!payload.sub || !payload.jti || (payload.role !== "teacher" && payload.role !== "student") || typeof payload.class_id !== "string") return null;
      const identity = await this.repository.findValidIdentity(this.hashJti(payload.jti), new Date());
      if (!identity || identity.userId !== payload.sub || identity.role !== payload.role || identity.classId !== payload.class_id) return null;
      return identity;
    } catch {
      return null;
    }
  }

  async revoke(token: string): Promise<boolean> {
    try {
      const verified = await jwtVerify(token, this.key, {
        algorithms: ["HS256"], issuer: this.options.issuer, audience: this.options.audience,
      });
      return verified.payload.jti ? this.repository.revoke(this.hashJti(verified.payload.jti)) : false;
    } catch {
      return false;
    }
  }
}

export function bearerToken(value: string | undefined): string | null {
  if (!value) return null;
  const match = /^Bearer\s+([^\s]+)$/i.exec(value);
  return match?.[1] ?? null;
}
