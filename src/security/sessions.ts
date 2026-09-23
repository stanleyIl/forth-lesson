import { createHmac, randomBytes } from "node:crypto";

import {
  type SessionIdentity,
  SessionRepository,
} from "../db/repositories.js";

export class SessionService {
  constructor(
    private readonly repository: SessionRepository,
    private readonly secret: string,
    private readonly ttlSeconds: number,
  ) {}

  private hash(token: string): string {
    return createHmac("sha256", this.secret).update(token).digest("base64url");
  }

  async create(identity: SessionIdentity): Promise<{
    token: string;
    expiresAt: Date;
  }> {
    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + this.ttlSeconds * 1000);
    await this.repository.create({
      idHash: this.hash(token),
      identity,
      expiresAt,
    });
    return { token, expiresAt };
  }

  async authenticate(token: string | undefined): Promise<SessionIdentity | null> {
    if (!token || !/^[A-Za-z0-9_-]{40,}$/.test(token)) {
      return null;
    }
    return this.repository.findValidIdentity(this.hash(token), new Date());
  }

  async revoke(token: string | undefined): Promise<boolean> {
    if (!token || !/^[A-Za-z0-9_-]{40,}$/.test(token)) {
      return false;
    }
    return this.repository.deleteByIdHash(this.hash(token));
  }
}
