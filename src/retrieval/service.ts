import { RetrievalRepository, type RetrievalCandidate } from "../db/repositories.js";
import { EmbeddingProviderError, type EmbeddingProvider } from "./provider.js";
import { reciprocalRankFusion } from "./fusion.js";
export class RetrievalService {
  constructor(private readonly repository: RetrievalRepository, private readonly provider: EmbeddingProvider, private readonly options: { lexicalCandidates: number; vectorCandidates: number; rrfK: number; excerptLength: number }) {}
  async search(input: { classId: string; query: string; limit: number }) {
    const lexical = await this.repository.lexicalCandidates(input.classId, input.query, this.options.lexicalCandidates);
    let vector: RetrievalCandidate[] = []; let retrievalMode: "hybrid" | "lexical_fallback" = "hybrid";
    try { vector = await this.repository.vectorCandidates(input.classId, await this.provider.embedQuery(input.query), this.provider.model, this.options.vectorCandidates); } catch (error) { if (!(error instanceof EmbeddingProviderError)) throw error; retrievalMode = "lexical_fallback"; }
    const results = reciprocalRankFusion([...lexical, ...vector], input.limit, this.options.rrfK).map((result, index) => ({
      rank: index + 1,
      excerpt: result.excerpt.slice(0, this.options.excerptLength),
      scores: {
        combined: result.fusedScore,
        lexicalRank: result.lexicalRank,
        ...(retrievalMode === "hybrid" ? { vectorRank: result.vectorRank } : {}),
      },
      source: {
        materialId: result.materialId,
        originalFilename: result.filename,
        knowledgeEntryId: result.entryId,
        sequenceNumber: result.sequenceNumber,
      },
    }));
    return { retrievalMode, results };
  }
}
