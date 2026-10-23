export type ChatToolCall = { id: string; name: string; arguments: string };
export type ChatMessage={
  role:"system"|"user"|"assistant"|"tool";
  content:string;
  toolCallId?:string;
  name?:string;
  toolCalls?:ChatToolCall[];
};
export type ChatToolDefinition={
  type:"function";
  function:{name:string;description:string;parameters:Record<string,unknown>};
};
export type ChatCompletionResult={content:string;finishReason:string;toolCalls:ChatToolCall[]};
export interface ChatProvider{
  model:string;
  complete(messages:ChatMessage[]):Promise<string>;
  completeWithTools?(messages:ChatMessage[],tools:ChatToolDefinition[]):Promise<ChatCompletionResult>;
}
export class ChatProviderError extends Error{}
export class HttpChatProvider implements ChatProvider{
  constructor(private readonly options:{endpoint:string;apiKey?:string;model:string;timeoutMs:number;maxTokens:number}){}
  get model(){return this.options.model}
  async complete(messages:ChatMessage[]):Promise<string>{
    const result=await this.completeWithTools(messages,[]);
    if(!result.content.trim())throw new ChatProviderError("Invalid chat response");
    return result.content.trim();
  }
  async completeWithTools(messages:ChatMessage[],tools:ChatToolDefinition[]):Promise<ChatCompletionResult>{
    const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),this.options.timeoutMs);
    try{const response=await fetch(this.options.endpoint,{method:"POST",headers:{"content-type":"application/json",...(this.options.apiKey?{authorization:`Bearer ${this.options.apiKey}`}:{})},body:JSON.stringify({model:this.options.model,messages:messages.map(message=>message.role==="tool"?{role:"tool",content:message.content,tool_call_id:message.toolCallId,name:message.name}:message.toolCalls?{role:message.role,content:message.content||null,tool_calls:message.toolCalls.map(call=>({id:call.id,type:"function",function:{name:call.name,arguments:call.arguments}}))}:{role:message.role,content:message.content}),max_tokens:this.options.maxTokens,stream:false,...(tools.length?{tools,tool_choice:"auto"}:{})}),signal:controller.signal});
      if(!response.ok)throw new ChatProviderError(`Chat provider returned ${response.status}`);
      const payload=await response.json() as {choices?:Array<{finish_reason?:unknown;message?:{content?:unknown;tool_calls?:Array<{id?:unknown;function?:{name?:unknown;arguments?:unknown}}>}}>};
      const choice=payload.choices?.[0];const content=typeof choice?.message?.content==="string"?choice.message.content:"";
      const toolCalls=(choice?.message?.tool_calls??[]).map(call=>{
        if(typeof call.id!=="string"||typeof call.function?.name!=="string"||typeof call.function.arguments!=="string")throw new ChatProviderError("Invalid chat tool call");
        return{id:call.id,name:call.function.name,arguments:call.function.arguments};
      });
      if(!content.trim()&&!toolCalls.length)throw new ChatProviderError("Invalid chat response");
      return{content:content.trim(),finishReason:typeof choice?.finish_reason==="string"?choice.finish_reason:"stop",toolCalls};
    }catch(error){if(error instanceof ChatProviderError)throw error;throw new ChatProviderError("Chat provider unavailable");}finally{clearTimeout(timer)}
  }
}
