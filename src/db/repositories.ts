import { randomUUID } from "node:crypto";

import type pg from "pg";

export type Database = Pick<pg.Pool, "query">;
export type Role = "teacher" | "student";

export type UserRecord = {
  id: string;
  account_identifier: string;
  password_hash: string;
  role: Role;
  class_id: string;
};

export type SessionIdentity = {
  userId: string;
  role: Role;
  classId: string;
};

export class UserRepository {
  constructor(private readonly database: Database) {}

  async findByAccount(accountIdentifier: string): Promise<UserRecord | null> {
    const result = await this.database.query(
      `SELECT id, account_identifier, password_hash, role, class_id
       FROM users WHERE account_identifier = $1`,
      [accountIdentifier],
    );
    return (result.rows[0] as UserRecord | undefined) ?? null;
  }

  async findById(userId: string): Promise<UserRecord | null> {
    const result = await this.database.query(
      `SELECT id, account_identifier, password_hash, role, class_id
       FROM users WHERE id = $1`,
      [userId],
    );
    return (result.rows[0] as UserRecord | undefined) ?? null;
  }
}

export class SessionRepository {
  constructor(private readonly database: Database) {}

  async create(input: {
    idHash: string;
    identity: SessionIdentity;
    expiresAt: Date;
  }): Promise<void> {
    await this.database.query(
      `INSERT INTO sessions (id_hash, user_id, role, class_id, expires_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        input.idHash,
        input.identity.userId,
        input.identity.role,
        input.identity.classId,
        input.expiresAt,
      ],
    );
  }

  async findValidIdentity(
    idHash: string,
    now: Date,
  ): Promise<SessionIdentity | null> {
    const result = await this.database.query(
      `SELECT u.id AS user_id, u.role, u.class_id
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.id_hash = $1 AND s.expires_at > $2`,
      [idHash, now],
    );
    const row = result.rows[0] as
      | { user_id: string; role: Role; class_id: string }
      | undefined;
    return row
      ? { userId: row.user_id, role: row.role, classId: row.class_id }
      : null;
  }
}

export type MaterialRecord = {
  id: string;
  uploader_user_id: string;
  class_id: string;
  original_filename: string;
  storage_key: string;
  file_type: "txt" | "md";
  size_bytes: number;
  created_at: Date;
};

export type KnowledgeEntryRecord = {
  id: string;
  material_id: string;
  class_id: string;
  content: string;
  sequence_number: number;
  created_at: Date;
};

export class MaterialRepository {
  constructor(private readonly database: Database) {}

  async listForClass(classId: string): Promise<MaterialRecord[]> {
    const result = await this.database.query(
      `SELECT id, uploader_user_id, class_id, original_filename, storage_key,
              file_type, size_bytes, created_at
       FROM materials
       WHERE class_id = $1
       ORDER BY created_at DESC, id`,
      [classId],
    );
    return result.rows as MaterialRecord[];
  }

  async findForClass(
    materialId: string,
    classId: string,
  ): Promise<MaterialRecord | null> {
    const result = await this.database.query(
      `SELECT id, uploader_user_id, class_id, original_filename, storage_key,
              file_type, size_bytes, created_at
       FROM materials WHERE id = $1 AND class_id = $2`,
      [materialId, classId],
    );
    return (result.rows[0] as MaterialRecord | undefined) ?? null;
  }

  async create(input: {
    id?: string;
    uploaderUserId: string;
    classId: string;
    originalFilename: string;
    storageKey: string;
    fileType: "txt" | "md";
    sizeBytes: number;
  }): Promise<MaterialRecord> {
    const id = input.id ?? randomUUID();
    const result = await this.database.query(
      `INSERT INTO materials
        (id, uploader_user_id, class_id, original_filename, storage_key, file_type, size_bytes)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, uploader_user_id, class_id, original_filename, storage_key,
                 file_type, size_bytes, created_at`,
      [
        id,
        input.uploaderUserId,
        input.classId,
        input.originalFilename,
        input.storageKey,
        input.fileType,
        input.sizeBytes,
      ],
    );
    return result.rows[0] as MaterialRecord;
  }
}

export class KnowledgeEntryRepository {
  constructor(private readonly database: Database) {}

  async findForClass(
    entryId: string,
    classId: string,
  ): Promise<KnowledgeEntryRecord | null> {
    const result = await this.database.query(
      `SELECT id, material_id, class_id, content, sequence_number, created_at
       FROM knowledge_entries WHERE id = $1 AND class_id = $2`,
      [entryId, classId],
    );
    return (result.rows[0] as KnowledgeEntryRecord | undefined) ?? null;
  }

  async listForMaterial(
    materialId: string,
    classId: string,
  ): Promise<KnowledgeEntryRecord[]> {
    const result = await this.database.query(
      `SELECT id, material_id, class_id, content, sequence_number, created_at
       FROM knowledge_entries
       WHERE material_id = $1 AND class_id = $2
       ORDER BY sequence_number`,
      [materialId, classId],
    );
    return result.rows as KnowledgeEntryRecord[];
  }

  async createMany(
    materialId: string,
    classId: string,
    contents: string[],
  ): Promise<KnowledgeEntryRecord[]> {
    const records: KnowledgeEntryRecord[] = [];
    for (const [sequenceNumber, content] of contents.entries()) {
      const result = await this.database.query(
        `INSERT INTO knowledge_entries
          (id, material_id, class_id, content, sequence_number)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, material_id, class_id, content, sequence_number, created_at`,
        [randomUUID(), materialId, classId, content, sequenceNumber],
      );
      records.push(result.rows[0] as KnowledgeEntryRecord);
    }
    return records;
  }
}
