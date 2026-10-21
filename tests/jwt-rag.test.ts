import { describe, expect, it, vi } from "vitest";
import { buildApp } from "../src/app.js";
import { AssistantConfigRepository, ChunkRepository } from "../src/db/assistant-repositories.js";
import { seedAccounts } from "../src/db/seed.js";
import { chunkText } from "../src/knowledge/chunker.js";
import { GroundedAnswerService, NO_KNOWLEDGE_ANSWER } from "../src/assistant/grounded-answer.js";
import { createTestDatabase } from "./helpers/database.js";

const config = {
  nodeEnv:"test",host:"127.0.0.1",port:3000,databaseUrl:"postgresql://unused",
  sessionSecret:"test-session-secret-at-least-32-characters",sessionTtlSeconds:3600,sessionCookieName:"campusclaw_session",sessionCookieSecure:false,uploadMaxBytes:1024,materialStorageRoot:"/tmp/unused",
  embeddingEndpoint:"http://embed",embeddingModel:"embed",embeddingTimeoutMs:100,embeddingBatchSize:10,searchMaxQueryLength:1000,searchDefaultLimit:10,searchMaxLimit:50,searchLexicalCandidates:50,searchVectorCandidates:50,searchExcerptLength:240,searchRrfK:60,
  jwtSecret:"test-jwt-secret-at-least-32-characters",jwtIssuer:"campusclaw",jwtAudience:"campusclaw-browser",jwtTtlSeconds:3600,
  chatEndpoint:"http://chat",chatModel:"chat",chatTimeoutMs:100,chatMaxTokens:300,askMaxQuestionLength:1000,conversationHistoryMessages:12,conversationHistoryChars:12000,chunkMaxChars:100,chunkOverlapChars:10,vectorSimilarityThreshold:.35,
} as const;

describe("JWT Bearer authentication",()=>{
  it("issues, authenticates and revokes a Bearer token while Cookie remains compatible",async()=>{
    const pool=await createTestDatabase();await seedAccounts(pool,[{accountIdentifier:"teacher-a",password:"password",role:"teacher",classId:"a",className:"A"}]);
    const app=buildApp({config,database:pool,logger:false,embeddingProvider:{model:"embed",embedQuery:async()=>[1],embedDocuments:async texts=>texts.map(()=>[1])},chatProvider:{model:"chat",complete:async()=>"回答 [1]"}});await app.ready();
    const login=await app.inject({method:"POST",url:"/api/login",payload:{accountIdentifier:"teacher-a",password:"password"}});expect(login.statusCode).toBe(200);const token=login.json().accessToken;expect(token.split(".")).toHaveLength(3);
    expect((await app.inject({url:"/api/me",headers:{authorization:`Bearer ${token}`}})).statusCode).toBe(200);
    expect((await app.inject({url:"/api/me",headers:{authorization:`Bearer ${token}x`}})).statusCode).toBe(401);
    expect((await app.inject({url:"/api/me",headers:{cookie:String(login.headers["set-cookie"]).split(";")[0]}})).statusCode).toBe(200);
    expect((await app.inject({method:"POST",url:"/api/logout",headers:{authorization:`Bearer ${token}`}})).statusCode).toBe(200);
    expect((await app.inject({url:"/api/me",headers:{authorization:`Bearer ${token}`}})).statusCode).toBe(401);
    await app.close();await pool.end();
  });
});

describe("chunk strategies",()=>{
  it("creates overlapping automatic chunks with stable offsets",()=>{const chunks=chunkText({text:"a".repeat(230),strategy:"auto",maxChars:100,overlapChars:20});expect(chunks.length).toBeGreaterThan(2);expect(chunks[1].startOffset).toBeLessThan(chunks[0].endOffset);});
  it("supports separators and Markdown headings",()=>{expect(chunkText({text:"one\n\ntwo",strategy:"separator",separator:"\n\n",maxChars:100,overlapChars:10}).map(c=>c.text)).toEqual(["one","two"]);const headings=chunkText({text:"# A\ntext\n## B\nmore",strategy:"markdown_heading",maxChars:100,overlapChars:10});expect(headings[0].text).toContain("# A");expect(headings[1].text).toContain("## B");});
});

describe("grounded answers",()=>{
  it("does not call chat provider when no chunks match",async()=>{const complete=vi.fn();const service=new GroundedAnswerService({search:async()=>({mode:"hybrid",hits:[]})} as never,{get:async()=>({system_prompt:"prompt",guided_solving_enabled:true})} as never,{model:"chat",complete} as never,{messages:10,chars:1000});const result=await service.answer({identity:{userId:"u",role:"student",classId:"a"},question:"weather"});expect(result.answer).toBe(NO_KNOWLEDGE_ANSWER);expect(result.citations).toEqual([]);expect(complete).not.toHaveBeenCalled();});
  it("sends prompt skill and evidence and preserves citation order",async()=>{const complete=vi.fn(async()=>"磁铁不能吸木块。[1]");const hit={chunkId:"c",materialId:"m",knowledgeEntryId:"e",classId:"a",filename:"science.md",chunkIndex:0,startOffset:0,endOffset:10,excerpt:"磁铁不能吸木块",fusedScore:.1};const service=new GroundedAnswerService({search:async()=>({mode:"hybrid",hits:[hit]})} as never,{get:async()=>({system_prompt:"科学老师",guided_solving_enabled:true})} as never,{model:"chat",complete} as never,{messages:10,chars:1000});const result=await service.answer({identity:{userId:"u",role:"student",classId:"a"},question:"磁铁能吸木块吗"});expect(result.citations[0]).toMatchObject({index:1,filename:"science.md",chunkId:"c"});const messages=complete.mock.calls[0][0];expect(JSON.stringify(messages)).toContain("科学老师");expect(JSON.stringify(messages)).toContain("解题引导");expect(JSON.stringify(messages)).toContain("磁铁不能吸木块");});
});

describe("assistant configuration authorization",()=>{
  it("allows teacher update and rejects student update",async()=>{const pool=await createTestDatabase();await seedAccounts(pool,[{accountIdentifier:"teacher",password:"password",role:"teacher",classId:"a",className:"A"},{accountIdentifier:"student",password:"password",role:"student",classId:"a",className:"A"}]);const app=buildApp({config,database:pool,logger:false,embeddingProvider:{model:"embed",embedQuery:async()=>[1],embedDocuments:async t=>t.map(()=>[1])},chatProvider:{model:"chat",complete:async()=>"answer"}});await app.ready();const login=async(account:string)=>{const r=await app.inject({method:"POST",url:"/api/login",payload:{accountIdentifier:account,password:"password"}});return r.json().accessToken};const teacher=await login("teacher"),student=await login("student");expect((await app.inject({method:"PATCH",url:"/api/assistant-config",headers:{authorization:`Bearer ${teacher}`},payload:{systemPrompt:"你是严谨的科学教师助手"}})).statusCode).toBe(200);expect((await app.inject({method:"PATCH",url:"/api/assistant-config",headers:{authorization:`Bearer ${student}`},payload:{guidedSolvingEnabled:false}})).statusCode).toBe(403);expect((await new AssistantConfigRepository(pool).get("a")).system_prompt).toContain("科学教师");await app.close();await pool.end();});
});
