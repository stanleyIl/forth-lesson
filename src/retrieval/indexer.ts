import { KnowledgeEntryRepository, RetrievalRepository } from "../db/repositories.js";
import type { EmbeddingProvider } from "./provider.js";

export class EmbeddingIndexer {
  constructor(private readonly entries: KnowledgeEntryRepository, private readonly retrieval: RetrievalRepository, private readonly provider: EmbeddingProvider) {}

  async index(classId?: string): Promise<{ processed: number; ready: number; failed: number }> {
    const records = await this.entries.listForIndexing(classId);
    const counts = { processed: 0, ready: 0, failed: 0 };
    for (let start = 0; start < records.length; start += 32) {
      const batch = records.slice(start, start + 32);
      await Promise.all(batch.map((entry) => this.retrieval.upsertEmbedding({ entryId: entry.id, classId: entry.class_id, model: this.provider.model, status: "pending" })));
      try {
        const vectors = await this.provider.embedDocuments(batch.map((entry) => entry.content));
        await Promise.all(batch.map((entry, index) => this.retrieval.upsertEmbedding({ entryId: entry.id, classId: entry.class_id, model: this.provider.model, status: "ready", embedding: vectors[index] })));
        counts.ready += batch.length;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Embedding provider unavailable";
        await Promise.all(batch.map((entry) => this.retrieval.upsertEmbedding({ entryId: entry.id, classId: entry.class_id, model: this.provider.model, status: "failed", errorMessage: message })));
        counts.failed += batch.length;
      }
      counts.processed += batch.length;
    }
    return counts;
  }
}
