import pg from "pg";
import { loadConfig } from "../config.js";
import { ChunkRepository } from "../db/assistant-repositories.js";
import { HttpEmbeddingProvider } from "../retrieval/provider.js";
import { ChunkIndexer } from "./chunk-indexer.js";

const config = loadConfig();
const pool = new pg.Pool({ connectionString: config.databaseUrl });
try {
  const provider = new HttpEmbeddingProvider({ endpoint: config.embeddingEndpoint, apiKey: config.embeddingApiKey, model: config.embeddingModel, timeoutMs: config.embeddingTimeoutMs, batchSize: config.embeddingBatchSize });
  const result = await new ChunkIndexer(pool, new ChunkRepository(pool), provider, { maxChars: config.chunkMaxChars, overlapChars: config.chunkOverlapChars }).backfill();
  console.log(JSON.stringify(result));
} finally { await pool.end(); }
