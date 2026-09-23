# Lesson 4 Verification

## Automated checks

- `npm run build` passes.
- `npm test` passes with 59 tests.
- `npx openspec validate add-class-scoped-traceable-knowledge-retrieval --strict` passes.

## Compose checks

Run from the repository root after setting a local `SESSION_SECRET`:

```bash
source ~/.zshrc
export SESSION_SECRET='replace-with-a-local-secret-at-least-32-chars'
docker compose up --build --wait
```

Observed on September 23, 2026:

- `application` and `database` containers became healthy.
- `/health` returned `{"status":"ok"}`.
- PostgreSQL reported `vector` extension version `0.8.6`.
- Migrations `001_initial_schema` and `002_knowledge_retrieval` were applied.
- `knowledge_entries_search_vector_idx`, class/model/status indexes, and the `vector` embedding column were present.
- Teacher login and `.md` upload returned success.
- Search returned a same-class source with material ID, filename, knowledge-entry ID, sequence, excerpt, rank, and scores.
- With no embedding provider configured, search returned `lexical_fallback`; backfill recorded retryable `failed` states without invalid vectors.
- With a local credential-free mock embedding endpoint, backfill reported `processed: 3`, `ready: 3`, and hybrid search returned both lexical and vector ranks.
- Repeating backfill reported `processed: 0` and `skipped: 3`, proving current-model idempotency.
- Recreating the application container retained 3 materials, 3 knowledge entries, and 3 embedding records in named volumes.

## Scope boundaries

The implementation does not add RAG answer generation, AI conversation, global search, unsupported media ingestion, client-side authorization, or provider credentials in responses/logs.

Full `hybrid` production retrieval requires configuring an OpenAI-compatible embedding endpoint through `EMBEDDING_ENDPOINT`, `EMBEDDING_MODEL`, and optionally `EMBEDDING_API_KEY`. Unit coverage exercises the hybrid fusion path without storing a real credential.
