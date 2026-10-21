import { AssistantConfigRepository, type ChunkHit } from "../db/assistant-repositories.js";
import type { SessionIdentity } from "../db/repositories.js";
import { ChunkSearchService } from "../knowledge/search.js";
import type { ChatMessage, ChatProvider } from "./chat-provider.js";

export const NO_KNOWLEDGE_ANSWER="资料中未找到相关内容";
export type Citation={index:number;chunkId:string;materialId:string;knowledgeEntryId:string;filename:string;chunkIndex:number;startOffset:number;endOffset:number;excerpt:string};
export class GroundedAnswerService{
 constructor(private readonly search:ChunkSearchService,private readonly configs:AssistantConfigRepository,private readonly chat:ChatProvider,private readonly historyOptions:{messages:number;chars:number}){}
 async answer(input:{identity:SessionIdentity;question:string;history?:Array<{role:"user"|"assistant";content:string}>}){
  const result=await this.search.search({classId:input.identity.classId,q:input.question,mode:"hybrid",limit:4,offset:0});
  if(!result.hits.length)return{answer:NO_KNOWLEDGE_ANSWER,citations:[] as Citation[],modelCalled:false};
  const config=await this.configs.get(input.identity.classId);const citations=result.hits.map((hit,index)=>this.citation(hit,index+1));
  const evidence=citations.map(c=>`[${c.index}] ${c.filename} 切片 ${c.chunkIndex} 偏移 ${c.startOffset}-${c.endOffset}\n${c.excerpt}`).join("\n\n");
  const skill=config.guided_solving_enabled?"启用解题引导：给出思路和提示，不直接给最终答案。":"解题引导未启用：可直接简洁回答。";
  const history=this.boundHistory(input.history??[]);
  const messages:ChatMessage[]=[{role:"system",content:`${config.system_prompt}\n${skill}\n只能依据编号资料回答，使用 [1]、[2] 标注来源。`},...history,{role:"user",content:`资料：\n${evidence}\n\n问题：${input.question}`}];
  const answer=await this.chat.complete(messages);return{answer,citations,modelCalled:true,messages};
 }
 private citation(hit:ChunkHit,index:number):Citation{return{index,chunkId:hit.chunkId,materialId:hit.materialId,knowledgeEntryId:hit.knowledgeEntryId,filename:hit.filename,chunkIndex:hit.chunkIndex,startOffset:hit.startOffset,endOffset:hit.endOffset,excerpt:hit.excerpt}}
 private boundHistory(history:Array<{role:"user"|"assistant";content:string}>):ChatMessage[]{let chars=0;const output:ChatMessage[]=[];for(const item of history.slice(-this.historyOptions.messages).reverse()){if(item.role!=="user"&&item.role!=="assistant")continue;if(chars+item.content.length>this.historyOptions.chars)break;chars+=item.content.length;output.unshift({role:item.role,content:item.content});}return output;}
}
