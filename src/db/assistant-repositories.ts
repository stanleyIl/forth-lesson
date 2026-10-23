import { createHash, randomUUID } from "node:crypto";
import type { Database, SessionIdentity } from "./repositories.js";
import type { ChunkStrategy, TextChunk } from "../knowledge/chunker.js";

export type ChunkHit = {
  chunkId: string; materialId: string; knowledgeEntryId: string; classId: string; filename: string;
  chunkIndex: number; startOffset: number; endOffset: number; excerpt: string;
  lexicalScore?: number; vectorScore?: number; lexicalRank?: number; vectorRank?: number; fusedScore?: number;
};

const vectorLiteral = (vector: number[]) => `[${vector.join(",")}]`;
const pgMemError = (error: unknown) => { const m = error instanceof Error ? error.message : String(error); return m.includes("pg-mem") || m.includes("🐜") || m.includes("does not exist"); };

export class ChunkRepository {
  constructor(private readonly database: Database) {}

  async entriesForMaterial(materialId: string, classId: string) {
    const result = await this.database.query(`SELECT id, content FROM knowledge_entries WHERE material_id=$1 AND class_id=$2 ORDER BY sequence_number`, [materialId, classId]);
    return result.rows as Array<{ id: string; content: string }>;
  }

  async replaceMaterial(input: { materialId: string; classId: string; strategy: ChunkStrategy; chunksByEntry: Array<{ entryId: string; chunks: TextChunk[] }> }): Promise<Array<{ id: string; text: string; classId: string }>> {
    const generation = randomUUID(); const created: Array<{ id: string; text: string; classId: string }> = [];
    for (const item of input.chunksByEntry) for (const chunk of item.chunks) {
      const id = randomUUID();
      await this.database.query(`INSERT INTO knowledge_chunks (id,generation_id,knowledge_entry_id,material_id,class_id,strategy,chunk_index,chunk_text,start_offset,end_offset,index_status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'ready')`, [id,generation,item.entryId,input.materialId,input.classId,input.strategy,chunk.index,chunk.text,chunk.startOffset,chunk.endOffset]);
      created.push({ id, text: chunk.text, classId: input.classId });
    }
    await this.database.query(`DELETE FROM knowledge_chunks WHERE material_id=$1 AND class_id=$2 AND generation_id<>$3`, [input.materialId,input.classId,generation]);
    return created;
  }

  async upsertEmbedding(input: { chunkId: string; classId: string; model: string; vector?: number[]; status: "pending"|"ready"|"failed"; error?: string }) {
    if (input.vector && (!input.vector.length || input.vector.some(v=>!Number.isFinite(v)))) throw new Error("Invalid chunk embedding");
    await this.database.query(`INSERT INTO knowledge_chunk_embeddings (chunk_id,class_id,model_identity,embedding,status,error_message,updated_at) VALUES ($1,$2,$3,$4,$5,$6,CURRENT_TIMESTAMP) ON CONFLICT (chunk_id) DO UPDATE SET class_id=EXCLUDED.class_id,model_identity=EXCLUDED.model_identity,embedding=EXCLUDED.embedding,status=EXCLUDED.status,error_message=EXCLUDED.error_message,updated_at=CURRENT_TIMESTAMP`, [input.chunkId,input.classId,input.model,input.vector?vectorLiteral(input.vector):null,input.status,input.error??null]);
  }

  async keyword(classId: string, query: string, limit: number, offset: number): Promise<ChunkHit[]> {
    let result;
    try { result = await this.database.query(`SELECT c.id AS chunk_id,c.material_id,c.knowledge_entry_id,c.class_id,m.original_filename,c.chunk_index,c.start_offset,c.end_offset,c.chunk_text,ts_rank_cd(c.search_vector,websearch_to_tsquery('simple',$2)) AS score FROM knowledge_chunks c JOIN materials m ON m.id=c.material_id AND m.class_id=c.class_id WHERE c.class_id=$1 AND c.index_status='ready' AND c.search_vector @@ websearch_to_tsquery('simple',$2) ORDER BY score DESC,c.id LIMIT $3 OFFSET $4`, [classId,query,limit,offset]); }
    catch(error){ if(!pgMemError(error)) throw error; result=await this.database.query(`SELECT c.id AS chunk_id,c.material_id,c.knowledge_entry_id,c.class_id,m.original_filename,c.chunk_index,c.start_offset,c.end_offset,c.chunk_text FROM knowledge_chunks c JOIN materials m ON m.id=c.material_id AND m.class_id=c.class_id WHERE c.class_id=$1 AND c.index_status='ready' AND lower(c.chunk_text) LIKE $2 ORDER BY c.id LIMIT $3 OFFSET $4`,[classId,`%${query.toLowerCase()}%`,limit,offset]); }
    if (!result.rows.length) {
      result = await this.database.query(`SELECT c.id AS chunk_id,c.material_id,c.knowledge_entry_id,c.class_id,m.original_filename,c.chunk_index,c.start_offset,c.end_offset,c.chunk_text FROM knowledge_chunks c JOIN materials m ON m.id=c.material_id AND m.class_id=c.class_id WHERE c.class_id=$1 AND c.index_status='ready' AND position(lower($2) in lower(c.chunk_text))>0 ORDER BY c.id LIMIT $3 OFFSET $4`,[classId,query,limit,offset]);
    }
    return result.rows.map((r,i)=>({chunkId:r.chunk_id,materialId:r.material_id,knowledgeEntryId:r.knowledge_entry_id,classId:r.class_id,filename:r.original_filename,chunkIndex:r.chunk_index,startOffset:r.start_offset,endOffset:r.end_offset,excerpt:r.chunk_text,lexicalScore:Number(r.score??1/(i+1)),lexicalRank:i+1}));
  }

  async vector(classId: string, queryVector: number[], model: string, threshold: number, limit: number, offset: number): Promise<ChunkHit[]> {
    let result;
    try { result=await this.database.query(`SELECT c.id AS chunk_id,c.material_id,c.knowledge_entry_id,c.class_id,m.original_filename,c.chunk_index,c.start_offset,c.end_offset,c.chunk_text,1-(e.embedding <=> $3::vector) AS score FROM knowledge_chunk_embeddings e JOIN knowledge_chunks c ON c.id=e.chunk_id AND c.class_id=e.class_id JOIN materials m ON m.id=c.material_id AND m.class_id=c.class_id WHERE e.class_id=$1 AND e.model_identity=$2 AND e.status='ready' AND e.embedding IS NOT NULL AND c.index_status='ready' AND 1-(e.embedding <=> $3::vector)>=$4 ORDER BY e.embedding <=> $3::vector,e.chunk_id LIMIT $5 OFFSET $6`,[classId,model,vectorLiteral(queryVector),threshold,limit,offset]); }
    catch(error){ if(!pgMemError(error)) throw error; return []; }
    return result.rows.map((r,i)=>({chunkId:r.chunk_id,materialId:r.material_id,knowledgeEntryId:r.knowledge_entry_id,classId:r.class_id,filename:r.original_filename,chunkIndex:r.chunk_index,startOffset:r.start_offset,endOffset:r.end_offset,excerpt:r.chunk_text,vectorScore:Number(r.score),vectorRank:i+1}));
  }
}

export type AssistantConfigRecord={class_id:string;system_prompt:string;guided_solving_enabled:boolean;version:number};
export class AssistantConfigRepository {
  constructor(private readonly database: Database) {}
  async ensure(classId:string){await this.database.query(`INSERT INTO assistant_configs(class_id,system_prompt,guided_solving_enabled) VALUES($1,$2,TRUE) ON CONFLICT(class_id) DO NOTHING`,[classId,"你是本班课程解题助手。仅依据提供的本班资料回答，并标注引用。"]);}
  async get(classId:string):Promise<AssistantConfigRecord>{await this.ensure(classId);return (await this.database.query(`SELECT class_id,system_prompt,guided_solving_enabled,version FROM assistant_configs WHERE class_id=$1`,[classId])).rows[0] as AssistantConfigRecord;}
  async update(classId:string,userId:string,input:{systemPrompt?:string;guided?:boolean}){await this.ensure(classId);const current=await this.get(classId);const prompt=input.systemPrompt??current.system_prompt;const guided=input.guided??current.guided_solving_enabled;return (await this.database.query(`UPDATE assistant_configs SET system_prompt=$2,guided_solving_enabled=$3,updated_by_user_id=$4,version=version+1,updated_at=CURRENT_TIMESTAMP WHERE class_id=$1 RETURNING class_id,system_prompt,guided_solving_enabled,version`,[classId,prompt,guided,userId])).rows[0] as AssistantConfigRecord;}
}

export class ConversationRepository {
  constructor(private readonly database: Database) {}
  async create(identity:SessionIdentity,title:string,applicationId?:string|null){const id=randomUUID();return (await this.database.query(`INSERT INTO conversations(id,user_id,class_id,title,ai_application_id) VALUES($1,$2,$3,$4,$5) RETURNING id,user_id,class_id,title,ai_application_id,created_at,updated_at`,[id,identity.userId,identity.classId,title,applicationId??null])).rows[0];}
  async list(identity:SessionIdentity){return (await this.database.query(`SELECT c.id,c.title,c.ai_application_id,a.name AS application_name,c.created_at,c.updated_at FROM conversations c LEFT JOIN ai_applications a ON a.id=c.ai_application_id AND a.class_id=c.class_id WHERE c.user_id=$1 AND c.class_id=$2 ORDER BY c.updated_at DESC,c.id`,[identity.userId,identity.classId])).rows;}
  async find(id:string,identity:SessionIdentity){return (await this.database.query(`SELECT c.id,c.user_id,c.class_id,c.title,c.ai_application_id,a.name AS application_name,c.created_at,c.updated_at FROM conversations c LEFT JOIN ai_applications a ON a.id=c.ai_application_id AND a.class_id=c.class_id WHERE c.id=$1 AND c.user_id=$2 AND c.class_id=$3`,[id,identity.userId,identity.classId])).rows[0]??null;}
  async addMessage(conversationId:string,role:"user"|"assistant",content:string,status:"pending"|"done"|"error",citations:unknown[]=[]){const id=randomUUID();await this.database.query(`INSERT INTO conversation_messages(id,conversation_id,role,content,status,citations_json) VALUES($1,$2,$3,$4,$5,$6)`,[id,conversationId,role,content,status,JSON.stringify(citations)]);await this.database.query(`UPDATE conversations SET updated_at=CURRENT_TIMESTAMP WHERE id=$1`,[conversationId]);return id;}
  async completeMessage(id:string,content:string,status:"done"|"error",citations:unknown[]=[]){await this.database.query(`UPDATE conversation_messages SET content=$2,status=$3,citations_json=$4 WHERE id=$1`,[id,content,status,JSON.stringify(citations)]);}
  async messages(conversationId:string){const rows=(await this.database.query(`SELECT id,role,content,status,citations_json,created_at FROM conversation_messages WHERE conversation_id=$1 ORDER BY created_at,id`,[conversationId])).rows;return rows.map(r=>({...r,citations:JSON.parse(r.citations_json)}));}
}

export function hashForEvidence(value:string){return createHash("sha256").update(value).digest("hex").slice(0,12);}
