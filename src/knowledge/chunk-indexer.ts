import type { Database } from "../db/repositories.js";
import { ChunkRepository } from "../db/assistant-repositories.js";
import type { EmbeddingProvider } from "../retrieval/provider.js";
import { chunkText, type ChunkStrategy } from "./chunker.js";

export class ChunkIndexer {
  constructor(
    private readonly database: Database,
    private readonly repository: ChunkRepository,
    private readonly provider: EmbeddingProvider,
    private readonly defaults: { maxChars: number; overlapChars: number },
  ) {}

  async indexMaterial(input: { materialId: string; classId: string; strategy?: ChunkStrategy; separator?: string; maxChars?: number; overlapChars?: number }) {
    const entries = await this.repository.entriesForMaterial(input.materialId, input.classId);
    const strategy = input.strategy ?? "auto";
    const chunksByEntry = entries.map(entry => ({ entryId: entry.id, chunks: chunkText({ text: entry.content, strategy, separator: input.separator, maxChars: input.maxChars ?? this.defaults.maxChars, overlapChars: input.overlapChars ?? this.defaults.overlapChars }) }));
    const chunks = await this.repository.replaceMaterial({ materialId: input.materialId, classId: input.classId, strategy, chunksByEntry });
    for (const chunk of chunks) await this.repository.upsertEmbedding({ chunkId: chunk.id, classId: chunk.classId, model: this.provider.model, status: "pending" });
    try {
      const vectors = await this.provider.embedDocuments(chunks.map(chunk => chunk.text));
      if (vectors.length !== chunks.length) throw new Error("Embedding count mismatch");
      for (let index = 0; index < chunks.length; index += 1) await this.repository.upsertEmbedding({ chunkId: chunks[index].id, classId: chunks[index].classId, model: this.provider.model, status: "ready", vector: vectors[index] });
      return { chunks: chunks.length, ready: chunks.length, failed: 0 };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Embedding unavailable";
      for (const chunk of chunks) await this.repository.upsertEmbedding({ chunkId: chunk.id, classId: chunk.classId, model: this.provider.model, status: "failed", error: message });
      return { chunks: chunks.length, ready: 0, failed: chunks.length };
    }
  }

  async backfill() {
    const result = await this.database.query(`SELECT m.id,m.class_id FROM materials m WHERE NOT EXISTS (SELECT 1 FROM knowledge_chunks c JOIN knowledge_chunk_embeddings e ON e.chunk_id=c.id AND e.class_id=c.class_id AND e.model_identity=$1 AND e.status='ready' WHERE c.material_id=m.id AND c.class_id=m.class_id AND c.index_status='ready')`, [this.provider.model]);
    const counts = { processed: 0, ready: 0, failed: 0, skipped: 0 };
    const total = await this.database.query(`SELECT count(*)::int AS count FROM materials`);
    counts.skipped = Number(total.rows[0]?.count ?? 0) - result.rows.length;
    for (const row of result.rows) { const item = await this.indexMaterial({ materialId: row.id, classId: row.class_id }); counts.processed += 1; counts.ready += item.ready; counts.failed += item.failed; }
    return counts;
  }
}
