export type EmbeddingProvider = { embedDocuments(texts: string[]): Promise<number[][]>; embedQuery(text: string): Promise<number[]>; model: string };
export class EmbeddingProviderError extends Error { constructor(message: string) { super(message); this.name = "EmbeddingProviderError"; } }
export class HttpEmbeddingProvider implements EmbeddingProvider {
  constructor(private readonly options: { endpoint: string; apiKey?: string; model: string; timeoutMs: number; batchSize: number }) {}
  get model() { return this.options.model; }
  async embedDocuments(texts: string[]) { const output: number[][] = []; for (let start = 0; start < texts.length; start += this.options.batchSize) output.push(...await this.request(texts.slice(start, start + this.options.batchSize))); return output; }
  async embedQuery(text: string) { return (await this.request([text]))[0]; }
  private async request(input: string[]): Promise<number[][]> {
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), this.options.timeoutMs);
    try {
      const response = await fetch(this.options.endpoint, { method: "POST", headers: { "content-type": "application/json", ...(this.options.apiKey ? { authorization: `Bearer ${this.options.apiKey}` } : {}) }, body: JSON.stringify({ input, model: this.options.model }), signal: controller.signal });
      if (!response.ok) throw new EmbeddingProviderError(`Embedding provider returned ${response.status}`);
      const payload = await response.json() as { data?: Array<{ embedding?: unknown }> };
      const vectors = payload.data?.map((item) => item.embedding);
      if (!vectors || vectors.some((vector) => !Array.isArray(vector) || vector.some((value) => typeof value !== "number"))) throw new EmbeddingProviderError("Embedding provider returned an invalid response");
      const dimension = (vectors[0] as number[]).length;
      if (!dimension || vectors.some((vector) => (vector as number[]).length !== dimension)) throw new EmbeddingProviderError("Embedding vectors have inconsistent dimensions");
      return vectors as number[][];
    } catch (error) { if (error instanceof EmbeddingProviderError) throw error; throw new EmbeddingProviderError("Embedding provider unavailable"); }
    finally { clearTimeout(timer); }
  }
}
