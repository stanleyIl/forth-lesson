# Spec Delta

## MODIFIED Requirements

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
