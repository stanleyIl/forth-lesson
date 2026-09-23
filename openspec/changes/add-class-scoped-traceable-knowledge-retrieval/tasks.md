# Tasks

## 1. Retrieval Configuration and Foundation

- [x] 1.1 Add validated runtime configuration for the embedding endpoint, optional credential, model identity, provider timeout, batch size, maximum query length, default/max result limits, lexical/vector candidate limits, excerpt limit, and RRF constant; verify configuration tests cover valid values, unsafe bounds, malformed URLs, and missing required model settings
- [x] 1.2 Extend safe logging rules so embedding credentials, full search queries, knowledge content, excerpts, and vectors are never logged; verify captured-log tests contain operation metadata but none of the sensitive values
- [x] 1.3 Add the retrieval module boundaries for query validation, embedding-provider access, indexing, repositories, rank fusion, and source projection; verify the TypeScript build and existing 50-test regression suite still pass before behavior is added

## 2. pgvector Schema and Compose Migration

- [x] 2.1 Add a versioned migration that enables the PostgreSQL `vector` extension, adds lexical search support for `knowledge_entries`, and creates `knowledge_entry_embeddings` with entry/class relationships, model identity, vector/index state, error metadata, timestamps, and cascade deletion; verify the migration applies to an existing iteration-1 schema without losing materials or knowledge entries
- [ ] 2.2 Add class/model/status indexes and a GIN full-text index that support bounded class-scoped retrieval and backfill scans; verify PostgreSQL query plans and schema inspection show the expected indexes and every embedding row remains tied to the same class as its knowledge entry
- [x] 2.3 Replace the Compose database image with a PostgreSQL 17 pgvector-capable image while retaining the existing `database_data` volume; verify Compose starts healthy against a copied existing volume and `SELECT extversion FROM pg_extension WHERE extname = 'vector'` succeeds
- [x] 2.4 Add rollback documentation for disabling retrieval and retaining or explicitly removing additive vector/index data; verify the documented rollback does not require deleting uploaded files or existing material records

## 3. Embedding Provider and Index Lifecycle

- [x] 3.1 Implement the server-side embedding-provider adapter with document batching, query embedding, model identity, optional authorization, timeout handling, response validation, and vector-dimension consistency checks; verify unit tests cover success, provider error, timeout, malformed response, credential redaction, and mixed dimensions
- [x] 3.2 Implement idempotent embedding persistence keyed by knowledge-entry ID, including pending, ready, and failed states and current-model replacement; verify repository tests prove retry does not duplicate rows, stale models are replaced, and fabricated vectors are never stored on failure
- [x] 3.3 Mark newly committed knowledge entries pending and trigger best-effort post-commit indexing without changing material-ingestion atomicity; verify upload tests prove lexical availability survives provider failure and failed vector indexing does not roll back the valid material or file
- [ ] 3.4 Add a bounded backfill command that indexes missing, failed, and stale-model entries in batches and reports processed/ready/failed/skipped counts; verify repeated runs are idempotent and a failed entry can succeed on a later retry
- [ ] 3.5 Ensure material deletion cascades through knowledge entries and vector/index records; verify an integration test deletes a material and finds no stale lexical candidate, vector candidate, or embedding row

## 4. Class-Scoped Lexical and Vector Retrieval

- [x] 4.1 Implement query normalization and validation for non-empty text, maximum length, and default/max result limits; verify unit and API tests cover whitespace-only, oversized, omitted-limit, zero, negative, and excessive-limit requests
- [x] 4.2 Implement the lexical candidate query with the trusted `class_id`, PostgreSQL text-search ranking, bounded candidates, excerpts, and deterministic ordering; verify same-class matches succeed and a stronger class-B textual match never enters a class-A candidate result
- [x] 4.3 Implement the vector candidate query with trusted `class_id`, current embedding-model identity, ready-state filtering, cosine-distance ordering, bounded candidates, and deterministic ties; verify a stronger class-B vector match and stale-model vectors never enter class-A results
- [x] 4.4 Implement reciprocal rank fusion that deduplicates entries, combines optional lexical/vector ranks, applies the configured constant, and uses deterministic tie-breaking; verify unit tests cover lexical-only, vector-only, dual-channel, duplicate, tie, and limit cases
- [x] 4.5 Implement class-scoped source projection joining the fused knowledge entry to its material by both material ID and class ID; verify every result's excerpt resolves to the returned entry/material and direct foreign identifiers cannot load cross-class source metadata

## 5. Search API, Fallback, and Browser Experience

- [x] 5.1 Expose authenticated `POST /api/knowledge-search` with the documented request and response shapes, using only session identity for scope; verify teacher and student searches return HTTP 200, unauthenticated search returns 401, and forged user/role/class fields do not affect results
- [x] 5.2 Implement normal hybrid execution using both lexical and vector candidates and return `retrievalMode: "hybrid"` with fused score and channel-rank metadata; verify end-to-end tests return one deduplicated ranked result per entry
- [x] 5.3 Implement query-embedding failure handling that runs lexical-only retrieval, returns `retrievalMode: "lexical_fallback"`, and omits vector scores; verify timeout and provider-error tests still enforce class isolation and return useful lexical results
- [x] 5.4 Implement no-match and database-failure behavior; verify no match returns HTTP 200 with an empty result list and no fabricated source, while a forced database failure returns generic HTTP 503 without SQL or provider details
- [x] 5.5 Add an authenticated search form and traceable result list to the existing materials page, linking each result to the allowed same-class material view; verify browser tests show filename, excerpt, sequence/source identifiers, mode, and rank without treating hidden controls as authorization

## 6. Security and Adversarial Verification

- [ ] 6.1 Add adversarial tests that place exact textual and semantic matches in another class and attempt body, query, route, header, material-ID, and entry-ID overrides; verify no response, rank, score, excerpt, timing-visible source load, or log discloses class-B data to class A
- [ ] 6.2 Add tests for teacher and student permissions proving both roles may search their own class while neither may search another class; verify unsupported roles receive HTTP 403 for the protected retrieval operation
- [ ] 6.3 Add logging and response audits proving embedding credentials, vectors, full queries, full knowledge content, SQL errors, and cross-class metadata are absent; verify only bounded excerpts and documented score/source fields leave the service

## 7. Container, Backfill, and Persistence Verification

- [x] 7.1 Document all retrieval and embedding environment variables in `.env.example` and README without a real credential; verify valid documented configuration starts and malformed retrieval bounds fail before traffic is accepted
- [ ] 7.2 Run Compose with the pgvector database, upload a material, confirm immediate lexical search, run backfill, and confirm hybrid search with correct provenance; retain request/response and database evidence for each transition
- [ ] 7.3 Recreate the application and database containers without deleting named volumes and verify materials, knowledge entries, embeddings, index states, and hybrid results remain available
- [ ] 7.4 Simulate embedding-provider outage in Compose and verify uploads remain valid, backfill records retryable failures, and search reports lexical fallback without cross-class leakage

## 8. Acceptance and Scope Review

- [ ] 8.1 Map every scenario in `class-scoped-knowledge-retrieval` to an automated test or documented container verification and verify each scenario has an explicit passing evidence reference
- [ ] 8.2 Run the complete build, unit, integration, migration, security, pgvector, backfill, browser, and Compose acceptance checks; verify all checks pass and retain command output before marking implementation tasks complete
- [x] 8.3 Review the implementation against the declared non-goals and security boundaries; verify no RAG answer generation, AI conversation, cross-class/global search, unsupported media ingestion, client-side authorization, or exposed provider secret was introduced
