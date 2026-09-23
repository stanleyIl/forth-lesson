import { describe, expect, it } from "vitest";
import { reciprocalRankFusion } from "../src/retrieval/fusion.js";
import { validateSearchInput } from "../src/retrieval/validation.js";
import { EmbeddingProviderError } from "../src/retrieval/provider.js";
import { RetrievalService } from "../src/retrieval/service.js";

describe("retrieval primitives", () => {
  it("validates bounded queries and defaults limit", () => {
    expect(validateSearchInput({ query: "  class isolation " }, 100, 10, 20)).toEqual({ query: "class isolation", limit: 10 });
    expect(() => validateSearchInput({ query: "   " }, 100, 10, 20)).toThrow();
    expect(() => validateSearchInput({ query: "ok", limit: 21 }, 100, 10, 20)).toThrow();
  });

  it("deduplicates channels and uses deterministic RRF ordering", () => {
    const results = reciprocalRankFusion([
      { entryId: "b", materialId: "m", classId: "a", filename: "b.md", sequenceNumber: 0, excerpt: "b", lexicalRank: 2 },
      { entryId: "a", materialId: "m", classId: "a", filename: "a.md", sequenceNumber: 0, excerpt: "a", lexicalRank: 1, vectorRank: 2 },
      { entryId: "a", materialId: "m", classId: "a", filename: "a.md", sequenceNumber: 0, excerpt: "a", vectorRank: 1 },
    ], 10, 60);
    expect(results).toHaveLength(2);
    expect(results[0].entryId).toBe("a");
    expect(results[0].lexicalRank).toBe(1);
  });

  it("falls back to lexical retrieval when query embedding fails", async () => {
    const repository = {
      lexicalCandidates: async () => [{ entryId: "e", materialId: "m", classId: "a", filename: "lesson.md", sequenceNumber: 0, excerpt: "bounded content", lexicalRank: 1, lexicalScore: 1 }],
      vectorCandidates: async () => { throw new EmbeddingProviderError("timeout"); },
    };
    const provider = { model: "test", embedQuery: async () => [1], embedDocuments: async () => [[1]] };
    const response = await new RetrievalService(repository, provider, { lexicalCandidates: 10, vectorCandidates: 10, rrfK: 60, excerptLength: 20 }).search({ classId: "a", query: "bounded", limit: 5 });
    expect(response.retrievalMode).toBe("lexical_fallback");
    expect(response.results[0].source.materialId).toBe("m");
    expect(response.results[0].scores).not.toHaveProperty("vectorRank");
  });

  it("returns hybrid source metadata when both channels are available", async () => {
    const repository = {
      lexicalCandidates: async () => [{ entryId: "e", materialId: "m", classId: "a", filename: "lesson.md", sequenceNumber: 2, excerpt: "hybrid content", lexicalRank: 1, lexicalScore: 1 }],
      vectorCandidates: async () => [{ entryId: "e", materialId: "m", classId: "a", filename: "lesson.md", sequenceNumber: 2, excerpt: "hybrid content", vectorRank: 1, vectorScore: 0.99 }],
    };
    const provider = { model: "test", embedQuery: async () => [1], embedDocuments: async () => [[1]] };
    const response = await new RetrievalService(repository, provider, { lexicalCandidates: 10, vectorCandidates: 10, rrfK: 60, excerptLength: 20 }).search({ classId: "a", query: "hybrid", limit: 5 });
    expect(response.retrievalMode).toBe("hybrid");
    expect(response.results).toHaveLength(1);
    expect(response.results[0].scores.vectorRank).toBe(1);
    expect(response.results[0].source.sequenceNumber).toBe(2);
  });
});

import { createTestDatabase } from "./helpers/database.js";
import { RetrievalRepository } from "../src/db/repositories.js";

describe("class isolation", () => {
  it("never returns another class lexical candidate", async () => {
    const pool = await createTestDatabase();
    await pool.query("INSERT INTO classes (id, name) VALUES ('a', 'A'), ('b', 'B')");
    await pool.query("INSERT INTO users (id, account_identifier, password_hash, role, class_id) VALUES ('ta', 'ta', 'hash', 'teacher', 'a'), ('tb', 'tb', 'hash', 'teacher', 'b')");
    await pool.query("INSERT INTO materials (id, uploader_user_id, class_id, original_filename, storage_key, file_type, size_bytes) VALUES ('ma', 'ta', 'a', 'a.md', 'a', 'md', 1), ('mb', 'tb', 'b', 'b.md', 'b', 'md', 1)");
    await pool.query("INSERT INTO knowledge_entries (id, material_id, class_id, content, search_document, sequence_number) VALUES ('ea', 'ma', 'a', 'public lesson', 'public lesson', 0), ('eb', 'mb', 'b', 'secret lesson', 'secret lesson', 0)");
    const candidates = await new RetrievalRepository(pool).lexicalCandidates("a", "secret", 10);
    expect(candidates).toEqual([]);
    await pool.end();
  });
});
