import pg from "pg";
import { loadConfig } from "../config.js";
import { KnowledgeEntryRepository, RetrievalRepository } from "../db/repositories.js";
import { HttpEmbeddingProvider } from "./provider.js";
import { EmbeddingIndexer } from "./indexer.js";

async function main() {
  const config = loadConfig();
  const pool = new pg.Pool({ connectionString: config.databaseUrl });
  try {
    const provider = new HttpEmbeddingProvider({ endpoint: config.embeddingEndpoint, apiKey: config.embeddingApiKey, model: config.embeddingModel, timeoutMs: config.embeddingTimeoutMs, batchSize: config.embeddingBatchSize });
    const counts = await new EmbeddingIndexer(new KnowledgeEntryRepository(pool), new RetrievalRepository(pool), provider).index();
    console.log(JSON.stringify(counts));
  } finally { await pool.end(); }
}
if (import.meta.url === `file://${process.argv[1]}`) await main();
