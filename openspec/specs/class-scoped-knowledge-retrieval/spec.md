# class-scoped-knowledge-retrieval Specification

## Purpose
Defines secure, class-scoped hybrid retrieval over ingested teaching materials, including deterministic ranking, vector-index lifecycle, failure behavior, and source metadata that lets every result be traced to its original material and knowledge entry.

## Requirements

### Requirement: Authenticated users can search their class knowledge
The system SHALL allow an authenticated teacher or student to submit a non-empty textual knowledge-search query. The server SHALL validate the query and a bounded result limit before performing retrieval.

#### Scenario: Teacher submits a valid query
- **WHEN** an authenticated teacher submits a non-empty query within the configured length limit
- **THEN** the server performs retrieval using the teacher's trusted session class and returns HTTP 200

#### Scenario: Student submits a valid query
- **WHEN** an authenticated student submits a non-empty query within the configured length limit
- **THEN** the server performs retrieval using the student's trusted session class and returns HTTP 200

#### Scenario: Unauthenticated search is rejected
- **WHEN** a client without a valid authenticated session submits a knowledge-search request
- **THEN** the server returns HTTP 401 and performs no retrieval

#### Scenario: Empty query is rejected
- **WHEN** an authenticated user submits a query that is empty or contains only whitespace
- **THEN** the server returns HTTP 400 and performs no retrieval

#### Scenario: Oversized query is rejected
- **WHEN** an authenticated user submits a query longer than the configured maximum query length
- **THEN** the server returns HTTP 400 and performs no retrieval

#### Scenario: Result limit is bounded
- **WHEN** an authenticated user omits the result limit or submits a limit outside the allowed range
- **THEN** the server uses the documented default when omitted and rejects an out-of-range limit with HTTP 400

### Requirement: Search is isolated by the trusted session class
The server MUST derive the effective `class_id` from the authenticated session and MUST apply that class predicate independently to lexical candidates, vector candidates, fused rankings, and source-record loading. Client-provided user, role, or class claims SHALL NOT expand the search scope.

#### Scenario: Same-class knowledge can be retrieved
- **WHEN** a class A user searches for text represented in a class A knowledge entry
- **THEN** the server may return that entry as a result

#### Scenario: Cross-class lexical match is excluded
- **WHEN** a class A user searches for terms that occur only in a class B knowledge entry
- **THEN** the server returns no class B result, content, score, or source metadata

#### Scenario: Cross-class vector match is excluded
- **WHEN** a class A query embedding is highly similar to a class B knowledge-entry embedding
- **THEN** the class B entry is excluded before vector ranking and is not returned

#### Scenario: Client class override is ignored
- **WHEN** a class A user supplies class B's identifier in the request body, query, route, or headers
- **THEN** the server searches only class A

#### Scenario: Direct source identifiers do not bypass isolation
- **WHEN** a class A user includes a class B material or knowledge-entry identifier in a search request
- **THEN** the identifier does not grant access and no class B source information is disclosed

### Requirement: Retrieval combines lexical and vector relevance
When query embedding generation is available, the system SHALL use PostgreSQL full-text ranking for class-scoped lexical candidates and pgvector distance ordering for class-scoped vector candidates persisted in the database `vector` type. It SHALL combine their ranks using a documented deterministic fusion rule and return results ordered by the fused ranking. Application-side scanning of all stored JSON embeddings SHALL NOT be the normal vector retrieval path.

#### Scenario: Hybrid search uses both candidate channels
- **WHEN** an authenticated user submits a valid query and query embedding generation succeeds
- **THEN** PostgreSQL returns bounded class-scoped lexical and pgvector candidates and the response identifies the retrieval mode as `hybrid`

#### Scenario: Entry found by both channels receives one result
- **WHEN** the same knowledge entry appears in both lexical and vector candidate sets
- **THEN** the server returns one fused result for that entry rather than duplicate results

#### Scenario: Ranking is deterministic
- **WHEN** the same user searches the same unchanged class corpus with the same query and limit
- **THEN** result ordering and reported ranking values are stable, including a deterministic tie-breaker

#### Scenario: Only indexed vectors enter vector ranking
- **WHEN** a knowledge entry has no ready pgvector embedding for the configured embedding model
- **THEN** it is excluded from vector candidates but remains eligible for PostgreSQL lexical retrieval

#### Scenario: Ready embedding is persisted in vector form
- **WHEN** document embedding generation succeeds
- **THEN** the database stores the embedding in its pgvector column with the current model identity and marks the entry ready

#### Scenario: Retrieval query plan uses database indexes
- **WHEN** representative lexical and vector retrieval queries are explained against the Compose database
- **THEN** the plans use the configured class/status/model and full-text or vector access paths without loading every class's embeddings into application memory

### Requirement: Every search result is traceable to its source
Each returned result SHALL include a non-empty matched excerpt and source metadata containing the `material_id`, original filename, `knowledge_entry_id`, and sequence number. Source metadata SHALL describe the same class-scoped records used to produce the result.

#### Scenario: Result contains complete source metadata
- **WHEN** a knowledge entry is returned by retrieval
- **THEN** the result contains its material ID, original filename, knowledge-entry ID, sequence number, excerpt, rank, retrieval mode contribution, and score information

#### Scenario: Source metadata resolves to the matched entry
- **WHEN** a user follows the source identifiers from a result through an allowed same-class material read
- **THEN** the referenced material and knowledge entry contain the returned excerpt

#### Scenario: Deleted source is not returned
- **WHEN** a material and its related knowledge entries have been deleted before a search
- **THEN** neither stale vector data nor source metadata for that material is returned

### Requirement: Knowledge entries have a repeatable vector-index lifecycle
The system SHALL track vector-index state and configured embedding-model identity for each knowledge entry. New and existing entries SHALL be indexable through idempotent operations that do not create duplicate vector records.

#### Scenario: New knowledge entry becomes pending for vector indexing
- **WHEN** material ingestion commits a new knowledge entry
- **THEN** the entry is immediately available to class-scoped lexical search and is marked pending until its embedding is stored

#### Scenario: Successful indexing makes an entry vector-searchable
- **WHEN** embedding generation succeeds for a pending knowledge entry
- **THEN** the vector and model identity are stored and the entry becomes eligible for vector retrieval

#### Scenario: Existing entries can be backfilled
- **WHEN** an operator runs the documented index backfill for knowledge entries created before this change
- **THEN** every eligible entry without a current-model embedding is processed without duplicating already current embeddings

#### Scenario: Failed indexing remains retryable
- **WHEN** embedding generation fails for a knowledge entry
- **THEN** the entry remains available to lexical search, its vector-index state records failure without storing a fabricated vector, and a later backfill can retry it

#### Scenario: Reindexing replaces stale model data
- **WHEN** the configured embedding model identity changes and backfill is run
- **THEN** entries with embeddings from the previous model are re-embedded and only current-model vectors are used for vector retrieval

### Requirement: Retrieval has explicit no-match and embedding-failure behavior
The system SHALL return an empty result list rather than inventing content when no class-scoped entry matches. If query embedding generation is unavailable but the database remains available, the system SHALL perform lexical-only retrieval and identify the degraded mode.

#### Scenario: No matching knowledge returns an empty list
- **WHEN** neither lexical nor eligible vector candidates in the user's class satisfy the query
- **THEN** the server returns HTTP 200 with an empty result list and does not fabricate an answer or source

#### Scenario: Query embedding failure uses lexical fallback
- **WHEN** query embedding generation times out or returns an error
- **THEN** the server performs class-scoped lexical retrieval, identifies the retrieval mode as `lexical_fallback`, and does not report vector scores

#### Scenario: Database retrieval failure is reported
- **WHEN** the database cannot execute the retrieval query
- **THEN** the server returns HTTP 503 with a generic retrieval-unavailable error and does not expose database details

### Requirement: Embedding and retrieval configuration is server-controlled
Embedding provider location, optional provider credentials, embedding-model identity, query limits, candidate limits, and fusion settings SHALL be loaded from validated server configuration. Credentials and full knowledge content MUST NOT be exposed to clients or written to logs.

#### Scenario: Server starts with valid retrieval configuration
- **WHEN** the server starts with a valid embedding endpoint, model identity, timeouts, and retrieval bounds
- **THEN** indexing and retrieval services initialize successfully

#### Scenario: Invalid retrieval configuration prevents unsafe startup
- **WHEN** configured query limits, candidate limits, timeouts, or fusion settings are malformed or unsafe
- **THEN** startup fails with a clear configuration error before application traffic is accepted

#### Scenario: Provider credential remains server-side
- **WHEN** indexing or query embedding calls the configured embedding provider
- **THEN** provider credentials are sent only to that provider and are absent from API responses and application logs
