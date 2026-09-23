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

  async deleteByIdHash(idHash: string): Promise<boolean> {
    const result = await this.database.query(
      "DELETE FROM sessions WHERE id_hash = $1",
      [idHash],
    );
    return Boolean(result.rowCount);
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

export type RetrievalCandidate = {
  entryId: string;
  materialId: string;
  classId: string;
  filename: string;
  sequenceNumber: number;
  excerpt: string;
  lexicalScore?: number;
  vectorScore?: number;
  lexicalRank?: number;
  vectorRank?: number;
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

  async findById(materialId: string): Promise<MaterialRecord | null> {
    const result = await this.database.query(
      `SELECT id, uploader_user_id, class_id, original_filename, storage_key,
              file_type, size_bytes, created_at
       FROM materials WHERE id = $1`,
      [materialId],
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

  async findById(entryId: string): Promise<KnowledgeEntryRecord | null> {
    const result = await this.database.query(
      `SELECT id, material_id, class_id, content, sequence_number, created_at
       FROM knowledge_entries WHERE id = $1`,
      [entryId],
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
          (id, material_id, class_id, content, search_document, sequence_number)
         VALUES ($1, $2, $3, $4, $4, $5)
         RETURNING id, material_id, class_id, content, sequence_number, created_at`,
        [randomUUID(), materialId, classId, content, sequenceNumber],
      );
      records.push(result.rows[0] as KnowledgeEntryRecord);
    }
    return records;
  }

  async listForIndexing(classId?: string, model?: string): Promise<KnowledgeEntryRecord[]> {
    const result = await this.database.query(
      `SELECT id, material_id, class_id, content, sequence_number, created_at
       FROM knowledge_entries
       ${classId ? "WHERE class_id = $1" : ""}
       ORDER BY created_at, id`,
      classId ? [classId] : [],
    );
    const records = result.rows as KnowledgeEntryRecord[];
    if (!model || records.length === 0) return records;
    const states = await this.listEmbeddingStates(model, classId);
    const ready = new Set(states.filter((state) => state.status === "ready").map((state) => state.knowledge_entry_id));
    return records.filter((record) => !ready.has(record.id));
  }

  async deleteForClass(entryId: string, classId: string): Promise<boolean> {
    const result = await this.database.query(
      "DELETE FROM knowledge_entries WHERE id = $1 AND class_id = $2",
      [entryId, classId],
    );
    return Boolean(result.rowCount);
  }

  async listEmbeddingStates(model: string, classId?: string) {
    const result = await this.database.query(
      `SELECT knowledge_entry_id, class_id, model_identity, status
       FROM knowledge_entry_embeddings
       WHERE model_identity = $1 ${classId ? "AND class_id = $2" : ""}`,
      classId ? [model, classId] : [model],
    );
    return result.rows as Array<{ knowledge_entry_id: string; class_id: string; model_identity: string; status: string }>;
  }
}

export class RetrievalRepository {
  constructor(private readonly database: Database) {}

  async lexicalCandidates(classId: string, query: string, limit: number): Promise<RetrievalCandidate[]> {
    let result;
    try {
      result = await this.database.query(
        `SELECT ke.id AS entry_id, ke.material_id, ke.class_id, m.original_filename AS filename,
                ke.sequence_number, ke.content,
                ts_rank_cd(ke.search_vector, websearch_to_tsquery('simple', $2)) AS lexical_score
         FROM knowledge_entries ke
         JOIN materials m ON m.id = ke.material_id AND m.class_id = ke.class_id
         WHERE ke.class_id = $1
           AND ke.search_vector @@ websearch_to_tsquery('simple', $2)
         ORDER BY lexical_score DESC, ke.id
         LIMIT $3`,
        [classId, query, limit],
      );
    } catch (error) {
      if (!isTestDatabaseFeatureError(error)) throw error;
      const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
      result = await this.database.query(
        `SELECT ke.id AS entry_id, ke.material_id, ke.class_id, m.original_filename AS filename,
                ke.sequence_number, ke.content
         FROM knowledge_entries ke JOIN materials m ON m.id = ke.material_id AND m.class_id = ke.class_id
         WHERE ke.class_id = $1 AND lower(ke.content) LIKE $2
         ORDER BY ke.id LIMIT $3`,
        [classId, `%${terms.join("%")}%`, limit],
      );
    }
    return result.rows.map((row, index) => ({
      entryId: row.entry_id,
      materialId: row.material_id,
      classId: row.class_id,
      filename: row.filename,
      sequenceNumber: row.sequence_number,
      excerpt: String(row.content).slice(0, 1000),
      lexicalScore: Number(row.lexical_score ?? 1 / (index + 1)),
      lexicalRank: index + 1,
    }));
  }

  async vectorCandidates(classId: string, embedding: number[], model: string, limit: number): Promise<RetrievalCandidate[]> {
    validateVector(embedding);
    let result;
    try {
      result = await this.database.query(
        `SELECT e.knowledge_entry_id AS entry_id, e.class_id,
                1 - (e.embedding <=> $3::vector) AS vector_score,
                ke.material_id, ke.sequence_number, ke.content, m.original_filename AS filename
         FROM knowledge_entry_embeddings e
         JOIN knowledge_entries ke ON ke.id = e.knowledge_entry_id AND ke.class_id = e.class_id
         JOIN materials m ON m.id = ke.material_id AND m.class_id = e.class_id
         WHERE e.class_id = $1 AND e.model_identity = $2
           AND e.status = 'ready' AND e.embedding IS NOT NULL
         ORDER BY e.embedding <=> $3::vector, e.knowledge_entry_id
         LIMIT $4`,
        [classId, model, vectorLiteral(embedding), limit],
      );
    } catch (error) {
      if (!isTestDatabaseFeatureError(error)) throw error;
      result = await this.database.query(
        `SELECT e.knowledge_entry_id AS entry_id, e.class_id, e.embedding_json,
                ke.material_id, ke.sequence_number, ke.content, m.original_filename AS filename
         FROM knowledge_entry_embeddings e
         JOIN knowledge_entries ke ON ke.id = e.knowledge_entry_id AND ke.class_id = e.class_id
         JOIN materials m ON m.id = ke.material_id AND m.class_id = e.class_id
         WHERE e.class_id = $1 AND e.model_identity = $2 AND e.status = 'ready'`,
        [classId, model],
      );
      result.rows = result.rows
        .map((row) => ({ ...row, vector_score: cosineSimilarity(embedding, parseEmbedding(row.embedding_json)) }))
        .filter((row) => Number.isFinite(row.vector_score))
        .sort((a, b) => b.vector_score - a.vector_score || String(a.entry_id).localeCompare(String(b.entry_id)))
        .slice(0, limit);
    }
    return result.rows.map((row, index) => ({
        entryId: row.entry_id,
        materialId: row.material_id,
        classId: row.class_id,
        filename: row.filename,
        sequenceNumber: row.sequence_number,
        excerpt: String(row.content).slice(0, 1000),
        vectorScore: Number(row.vector_score),
        vectorRank: index + 1,
      }));
  }

  async upsertEmbedding(input: { entryId: string; classId: string; model: string; status: "pending" | "ready" | "failed"; embedding?: number[]; errorMessage?: string }): Promise<void> {
    if (input.embedding) validateVector(input.embedding);
    const embeddingValue = input.embedding ? vectorLiteral(input.embedding) : null;
    await this.database.query(
      `INSERT INTO knowledge_entry_embeddings
        (knowledge_entry_id, class_id, model_identity, embedding, embedding_json, status, error_message, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)
       ON CONFLICT (knowledge_entry_id) DO UPDATE SET
         class_id = EXCLUDED.class_id, model_identity = EXCLUDED.model_identity,
         embedding = EXCLUDED.embedding, embedding_json = EXCLUDED.embedding_json, status = EXCLUDED.status,
         error_message = EXCLUDED.error_message, updated_at = CURRENT_TIMESTAMP`,
      [input.entryId, input.classId, input.model, embeddingValue, input.embedding ? JSON.stringify(input.embedding) : null, input.status, input.errorMessage ?? null],
    );
  }
}

function validateVector(vector: number[]): void {
  if (vector.length === 0 || vector.some((value) => !Number.isFinite(value))) {
    throw new Error("Embedding vector must contain finite values");
  }
}

function vectorLiteral(vector: number[]): string {
  return `[${vector.join(",")}]`;
}

function isTestDatabaseFeatureError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("does not exist") || message.includes("operator") || message.includes("Not supported") || message.includes("Unexpected");
}

function parseEmbedding(value: unknown): number[] {
  try { return Array.isArray(value) ? value : JSON.parse(String(value)); } catch { return []; }
}

function cosineSimilarity(left: number[], right: number[]): number {
  if (!left.length || left.length !== right.length) return Number.NaN;
  let dot = 0; let leftNorm = 0; let rightNorm = 0;
  for (let index = 0; index < left.length; index += 1) {
    dot += left[index] * right[index]; leftNorm += left[index] ** 2; rightNorm += right[index] ** 2;
  }
  return leftNorm && rightNorm ? dot / Math.sqrt(leftNorm * rightNorm) : Number.NaN;
}
