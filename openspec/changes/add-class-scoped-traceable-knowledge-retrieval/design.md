# Design

## Context

CampusClaw currently runs as one Fastify application backed by PostgreSQL. Material ingestion creates class-scoped `materials` and ordered `knowledge_entries`; authentication middleware resolves a trusted `userId`, `role`, and `classId`, and repositories include class predicates for protected reads. Docker Compose currently uses the standard PostgreSQL 17 image and a persistent database volume.

This change adds retrieval across existing and future knowledge entries. See `proposal.md` for motivation and `specs/class-scoped-knowledge-retrieval/spec.md` for the observable contract. The implementation must preserve the existing server-side class boundary and must not turn retrieval into answer generation.

## Goals / Non-Goals

**Goals:**

- Reuse the existing PostgreSQL security and persistence boundary for lexical and vector retrieval.
- Make class filtering mandatory at every candidate and source-loading stage.
- Produce stable hybrid rankings despite lexical and vector scores having different scales.
- Keep uploaded material usable when an embedding provider is temporarily unavailable.
- Make every result auditable back to one material and one knowledge entry.
- Provide an idempotent migration and backfill path for the existing database volume.

**Non-Goals:**

- Generating natural-language answers from search results.
- Selecting a production-scale distributed vector platform.
- Providing cross-class administration or global search.
- Building a user-facing model-selection or ranking-tuning interface.
- Guaranteeing approximate-nearest-neighbor latency for a large corpus in this classroom iteration.

## Decisions

### 1. Use PostgreSQL full-text search and pgvector in the existing database

Add the `vector` extension and store one current embedding per knowledge entry in a related `knowledge_entry_embeddings` table. Keep lexical search data in PostgreSQL using a generated or maintained `tsvector` value and a GIN index. The Compose database image changes to a PostgreSQL 17 image that includes pgvector, while the existing named volume remains the persistence boundary.

The embedding column will use pgvector's unconstrained `vector` type for this iteration. Retrieval will filter by the configured model identity and perform exact cosine-distance ordering over the current class. This permits provider/model substitution without a schema migration and is sufficient for the bounded classroom corpus. A future change may fix dimensions and add HNSW/IVFFlat after the model and scale are stable.

**Alternatives considered:**

- A separate Qdrant, Milvus, or Weaviate service: deferred because it introduces a second persistence, backup, authorization, and Compose lifecycle without a demonstrated scale requirement.
- Lexical-only retrieval: rejected because the course goal explicitly includes hybrid retrieval.
- Vector-only retrieval: rejected because exact terminology, identifiers, and uncommon teaching terms benefit from lexical matching.

### 2. Keep vector indexing asynchronous to the material database transaction

The existing ingestion transaction remains responsible for the material and knowledge entries. Lexical search is available immediately from the committed content. After commit, the indexing service marks new entries pending and attempts embedding generation; failure records a retryable failed state but does not roll back an otherwise valid material upload.

An idempotent backfill command scans entries whose embedding is missing, failed, or associated with an older model identity. Each successful result is upserted by knowledge-entry ID. A current-model row is skipped, so retries and container recreation do not duplicate vectors.

**Alternatives considered:**

- Calling the embedding provider before or inside the ingestion transaction: rejected because provider latency or outage would unnecessarily fail uploads and hold database transactions open.
- Never tracking index state: rejected because missing vectors would be indistinguishable from successful indexing and could not be safely retried.

### 3. Define a server-owned embedding-provider adapter

Introduce an adapter with batch document embedding and single query embedding operations. The first implementation uses an OpenAI-compatible HTTP embedding contract configured by endpoint, model identity, optional API key, request timeout, and batch size. Provider-specific request/response details remain behind the adapter.

Configuration validation adds maximum query length, default/max result limits, lexical/vector candidate limits, reciprocal-rank-fusion constant, embedding endpoint/model, timeout, and optional credential. Logs record operation type, timing, counts, and generic failures but never credentials, full queries, or knowledge content.

**Alternatives considered:**

- Hard-coding one hosted provider: rejected because credentials and availability differ between development and classroom environments.
- Generating embeddings in the browser: rejected because it would expose provider configuration and bypass the server authorization boundary.

### 4. Use one protected POST search operation

Expose `POST /api/knowledge-search` with JSON input:

```json
{
  "query": "course concept",
  "limit": 10
}
```

The route runs after existing authentication middleware. It ignores any additional user, role, class, material, or entry claims when determining scope. POST keeps query text out of ordinary URL and access-log fields. Validation trims the query, rejects empty/oversized values, and enforces a small configured result bound.

The response shape is:

```json
{
  "retrievalMode": "hybrid",
  "results": [
    {
      "rank": 1,
      "excerpt": "...",
      "scores": {
        "combined": 0.032,
        "lexicalRank": 1,
        "vectorRank": 2
      },
      "source": {
        "materialId": "...",
        "originalFilename": "lesson.md",
        "knowledgeEntryId": "...",
        "sequenceNumber": 0
      }
    }
  ]
}
```

The browser materials page gains a small authenticated search form and renders sources as links to the existing same-class material read. The API, not frontend visibility, remains the authorization boundary.

### 5. Apply class scope inside every retrieval query

The retrieval repository requires `classId` as a non-optional input. Lexical candidates select from `knowledge_entries` with `class_id = $trustedClassId`. Vector candidates join embeddings to entries and apply the same predicate before distance ordering. Fusion operates only on those scoped candidate IDs. Final source projection joins `materials` using both material ID and class ID.

No unscoped "fetch candidate then check afterward" helper will be exposed. Adversarial integration tests will create stronger matches in another class and attempt query, body, header, and direct-ID overrides.

**Alternatives considered:**

- Filtering after global lexical/vector retrieval: rejected because another class's data could influence rank, timing, logs, or accidental source loading even if hidden at serialization time.

### 6. Fuse rankings with reciprocal rank fusion

Lexical search uses PostgreSQL text-search ranking and vector search uses cosine distance. Because those scores are not directly comparable, each channel produces a bounded ordered candidate list and the service computes reciprocal rank fusion:

`combined = lexicalContribution + vectorContribution`, where each contribution is `1 / (k + rank)` when present.

The configured `k` is validated as a positive bounded integer. Duplicate entry IDs merge into one result. Results sort by combined score descending, best lexical rank, best vector rank, then knowledge-entry ID for deterministic ties. Raw provider vectors are never returned.

**Alternatives considered:**

- Weighted addition of normalized raw scores: rejected for the first iteration because normalization changes with corpus and candidate distribution.
- Letting PostgreSQL combine incomparable scores directly: rejected for the same reason.

### 7. Return bounded excerpts and authoritative source records

The server builds a plain-text excerpt from the matched knowledge entry with a configured maximum length. It returns source fields from the class-scoped database join, not from embedding-provider metadata or client data. Material deletion cascades to knowledge entries and embedding rows, preventing stale sources.

The API reports channel ranks and the fused score so retrieval behavior can be explained, but it does not expose the full embedding or hidden content outside the bounded excerpt.

### 8. Degrade explicitly to lexical retrieval

If query embedding generation times out or fails, the service still runs class-scoped lexical search and returns `retrievalMode: "lexical_fallback"`. Vector ranks are omitted. A no-match response is HTTP 200 with an empty list; it never creates an answer. Database retrieval failure returns a generic HTTP 503.

This separates provider availability from the security and usefulness of exact-term search while making the degraded behavior visible to callers.

**Alternatives considered:**

- Return HTTP 503 whenever embedding generation fails: rejected because already-ingested content remains safely searchable lexically.
- Silently label lexical results as hybrid: rejected because it would make verification and troubleshooting misleading.

### 9. Split tests between in-memory logic and a real pgvector container

Pure validation, fusion, fallback, and source-shaping logic will use unit tests with fake repositories/providers. Authentication and class-override behavior will use Fastify integration tests. SQL text-search, vector distance, extension/migration, backfill, and persistent-volume behavior will run against the Compose PostgreSQL/pgvector service because the existing `pg-mem` test database does not implement pgvector semantics.

## Risks / Trade-offs

- **[Risk] Embedding provider outage leaves entries without vectors** → Keep lexical search immediately available, track pending/failed state, and provide idempotent retries.
- **[Risk] Model changes make stored vectors incompatible** → Store model identity with each vector and exclude/reindex stale-model rows.
- **[Risk] Missing class predicates leak data or ranking signals** → Require `classId` in repository APIs, scope both candidate CTEs and source joins, and add stronger-cross-class-match tests.
- **[Risk] Exact vector scans become slow as the corpus grows** → Bound candidates and query limits now; add fixed dimensions and ANN indexes only after measuring corpus size and selecting a stable model.
- **[Risk] Full query/content logging exposes educational data** → Redact provider credentials and omit full query/content from request and error logs.
- **[Risk] Switching the database image can break an existing volume** → Keep the same PostgreSQL major version, enable the extension through a migration, back up before migration, and verify startup against a copied volume.
- **[Trade-off] Lexical fallback may produce lower semantic recall** → Expose the fallback mode so callers and operators know vector retrieval was unavailable.

## Migration Plan

1. Back up the existing PostgreSQL named volume.
2. Change the Compose database image to a PostgreSQL 17 pgvector image without deleting the named volume.
3. Apply a versioned migration that enables `vector`, adds lexical search/index structures, creates `knowledge_entry_embeddings` with cascade relationships and index-state metadata, and adds class/model indexes.
4. Start the application with validated retrieval and embedding configuration.
5. Run the idempotent backfill command for existing knowledge entries and record pending, ready, and failed counts.
6. Verify same-class lexical, vector, hybrid, fallback, provenance, and cross-class rejection scenarios.
7. Upload a new material, verify immediate lexical availability, complete vector indexing, recreate containers, and verify retrieval and sources persist.

Rollback disables the search route and application indexing worker/command first. Revert the application and Compose image while retaining the database volume; the additive search tables and extension may remain unused. Dropping vector/index data is optional and requires an explicit backup decision because it is destructive.
