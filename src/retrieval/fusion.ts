import type { RetrievalCandidate } from "../db/repositories.js";
export type FusedResult = RetrievalCandidate & { fusedScore: number };
export function reciprocalRankFusion(candidates: RetrievalCandidate[], limit: number, k: number): FusedResult[] {
  const byEntry = new Map<string, FusedResult>();
  for (const candidate of candidates) {
    const score = (candidate.lexicalRank ? 1 / (k + candidate.lexicalRank) : 0) + (candidate.vectorRank ? 1 / (k + candidate.vectorRank) : 0);
    const existing = byEntry.get(candidate.entryId);
    if (!existing) byEntry.set(candidate.entryId, { ...candidate, fusedScore: score });
    else byEntry.set(candidate.entryId, { ...existing, lexicalScore: candidate.lexicalScore ?? existing.lexicalScore, vectorScore: candidate.vectorScore ?? existing.vectorScore, lexicalRank: candidate.lexicalRank ?? existing.lexicalRank, vectorRank: candidate.vectorRank ?? existing.vectorRank, fusedScore: existing.fusedScore + score });
  }
  return [...byEntry.values()].sort((a, b) => b.fusedScore - a.fusedScore || a.entryId.localeCompare(b.entryId)).slice(0, limit);
}
