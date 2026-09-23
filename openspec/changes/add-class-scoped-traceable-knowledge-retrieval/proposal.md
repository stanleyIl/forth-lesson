# Proposal

## Why

CampusClaw can ingest class materials but cannot yet search the resulting knowledge entries. The fourth-course iteration needs secure, class-scoped retrieval whose results remain traceable to the exact uploaded material and knowledge entry instead of returning ungrounded content.

## What Changes

- Add authenticated knowledge search for teachers and students, with the effective `class_id` derived only from the trusted server-side session.
- Add hybrid retrieval that combines PostgreSQL full-text relevance with vector similarity, using PostgreSQL with the `pgvector` extension as the vector store.
- Add embedding/index metadata for knowledge entries and a repeatable backfill path so entries created before this change become searchable.
- Return source information with every hit, including the material ID, original filename, knowledge-entry ID, sequence number, matched excerpt, retrieval method, and score information.
- Ignore client attempts to select another class and prevent cross-class entries from entering lexical, vector, fusion, or source-loading queries.
- Define bounded query validation, deterministic ranking/tie-breaking, empty-result behavior, and an explicit lexical fallback when query embedding generation is unavailable.
- Add environment-driven embedding and retrieval configuration without exposing provider credentials to clients or logs.
- Extend Docker Compose with a pgvector-capable PostgreSQL image while preserving the existing application and persistent database volume.

### Non-goals

- RAG answer generation or AI conversation
- Automatic summarization of retrieved content
- Cross-class or school-wide search
- Teacher-configurable ranking weights or embedding models through the UI
- Image, PDF, audio, or video extraction
- A separately operated production vector-database cluster

## Capabilities

### New Capabilities

- `class-scoped-knowledge-retrieval`: Indexing, hybrid lexical/vector search, server-enforced class isolation, ranked results, source traceability, fallback behavior, and retrieval configuration.

### Modified Capabilities

None. The project has no archived main capability specs yet; this change introduces a new retrieval capability that consumes the existing `materials` and `knowledge_entries` model.

## Impact

- Adds a protected knowledge-search API and a retrieval interface on the authenticated materials page.
- Adds PostgreSQL `pgvector`, full-text/vector indexes, embedding metadata, and index-status fields or related records for knowledge entries.
- Adds an embedding-provider abstraction, query embedding generation, lexical/vector candidate retrieval, rank fusion, and source projection.
- Requires migration and backfill support for existing knowledge entries, plus integration with future material ingestion so new entries become searchable.
- Changes the Compose database image to a PostgreSQL image with pgvector support while retaining named-volume persistence.
- Requires automated verification for class isolation at every retrieval stage, source correctness, ranking behavior, provider failure, empty queries, no-match results, backfill, and container recreation.
