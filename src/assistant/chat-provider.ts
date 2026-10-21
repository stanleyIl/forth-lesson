export type ChatMessage={role:"system"|"user"|"assistant";content:string};
export interface ChatProvider{model:string;complete(messages:ChatMessage[]):Promise<string>}
export class ChatProviderError extends Error{}
export class HttpChatProvider implements ChatProvider{
  constructor(private readonly options:{endpoint:string;apiKey?:string;model:string;timeoutMs:number;maxTokens:number}){}
  get model(){return this.options.model}
  async complete(messages:ChatMessage[]):Promise<string>{
    const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),this.options.timeoutMs);
    try{const response=await fetch(this.options.endpoint,{method:"POST",headers:{"content-type":"application/json",...(this.options.apiKey?{authorization:`Bearer ${this.options.apiKey}`}:{})},body:JSON.stringify({model:this.options.model,messages,max_tokens:this.options.maxTokens,stream:false}),signal:controller.signal});
      if(!response.ok)throw new ChatProviderError(`Chat provider returned ${response.status}`);
      const payload=await response.json() as {choices?:Array<{message?:{content?:unknown}}>};const content=payload.choices?.[0]?.message?.content;if(typeof content!=="string"||!content.trim())throw new ChatProviderError("Invalid chat response");return content.trim();
    }catch(error){if(error instanceof ChatProviderError)throw error;throw new ChatProviderError("Chat provider unavailable");}finally{clearTimeout(timer)}
  }
}
