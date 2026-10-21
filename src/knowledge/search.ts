import { ChunkRepository, type ChunkHit } from "../db/assistant-repositories.js";
import type { EmbeddingProvider } from "../retrieval/provider.js";

export type SearchMode = "keyword" | "vector" | "hybrid";
export class SearchUnavailableError extends Error {}

function fuse(keyword: ChunkHit[], vector: ChunkHit[], limit: number, offset: number, k: number) {
  const map = new Map<string, ChunkHit>();
  for (const item of [...keyword, ...vector]) {
    const score = (item.lexicalRank ? 1/(k+item.lexicalRank) : 0) + (item.vectorRank ? 1/(k+item.vectorRank) : 0);
    const current = map.get(item.chunkId);
    map.set(item.chunkId, current ? { ...current, vectorRank:item.vectorRank??current.vectorRank,vectorScore:item.vectorScore??current.vectorScore,lexicalRank:item.lexicalRank??current.lexicalRank,lexicalScore:item.lexicalScore??current.lexicalScore,fusedScore:(current.fusedScore??0)+score } : { ...item, fusedScore:score });
  }
  return [...map.values()].sort((a,b)=>(b.fusedScore??0)-(a.fusedScore??0)||a.chunkId.localeCompare(b.chunkId)).slice(offset,offset+limit);
}

export class ChunkSearchService {
  constructor(private readonly repository:ChunkRepository,private readonly provider:EmbeddingProvider,private readonly options:{threshold:number;rrfK:number}){}
  async search(input:{classId:string;q:string;mode:SearchMode;limit:number;offset:number}){
    if(input.mode==="keyword") return {mode:"keyword" as const,hits:await this.repository.keyword(input.classId,input.q,input.limit,input.offset)};
    let vector:number[];
    try{vector=await this.provider.embedQuery(input.q);}catch{throw new SearchUnavailableError("Vector search unavailable");}
    if(input.mode==="vector") return {mode:"vector" as const,hits:await this.repository.vector(input.classId,vector,this.provider.model,this.options.threshold,input.limit,input.offset)};
    try{
      const [keywordHits,vectorHits]=await Promise.all([this.repository.keyword(input.classId,input.q,input.limit+input.offset,0),this.repository.vector(input.classId,vector,this.provider.model,this.options.threshold,input.limit+input.offset,0)]);
      return {mode:"hybrid" as const,hits:fuse(keywordHits,vectorHits,input.limit,input.offset,this.options.rrfK)};
    }catch{throw new SearchUnavailableError("Hybrid search unavailable");}
  }
}
