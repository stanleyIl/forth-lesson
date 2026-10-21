# Spec Delta

## ADDED Requirements

### Requirement: Knowledge entries are indexed as traceable chunks
The system SHALL split each indexed knowledge entry into ordered chunks containing chunk text, chunk index, and start/end character offsets. The original material and knowledge-entry text SHALL remain unchanged.

#### Scenario: Automatic chunking uses overlapping windows
- **WHEN** indexing uses the default automatic strategy
- **THEN** long text is split into bounded windows of approximately the configured maximum size with configured overlap and ordered offsets

#### Scenario: Custom separator chunking preserves order
- **WHEN** indexing uses a permitted separator strategy
- **THEN** non-empty segments become ordered chunks with traceable positions

#### Scenario: Markdown heading chunking retains headings
- **WHEN** Markdown indexing uses the heading strategy
- **THEN** headings remain in their section chunks and oversized sections are further split by the automatic rule

#### Scenario: Reindex replaces prior chunks and vectors
- **WHEN** an authorized teacher rebuilds a material index with a new strategy
- **THEN** prior chunks and their embeddings are removed or made ineligible before the new complete chunk set becomes searchable

### Requirement: Search exposes keyword vector and hybrid modes
The system SHALL expose class-scoped `keyword`, `vector`, and `hybrid` search modes over ready chunks. Keyword mode SHALL not call the embedding provider. Vector candidates below the configured cosine-similarity threshold SHALL be excluded. Hybrid mode SHALL fuse independently filtered keyword and vector ranks using deterministic RRF.

#### Scenario: Keyword mode avoids embedding call
- **WHEN** a user submits a valid keyword-mode query
- **THEN** the server searches ready chunks using database full-text ranking without generating a query vector

#### Scenario: Vector mode applies semantic threshold
- **WHEN** a vector-mode query embedding succeeds
- **THEN** only same-class ready chunks meeting the configured similarity threshold are returned in deterministic order

#### Scenario: Hybrid mode uses deterministic RRF
- **WHEN** a hybrid query has keyword and vector candidates
- **THEN** each channel is filtered independently and duplicate chunks are fused by RRF with the configured constant

#### Scenario: Vector dependency failure is explicit
- **WHEN** vector or hybrid mode cannot generate/query vectors while keyword storage remains available
- **THEN** the server returns generic HTTP 503 for that mode while keyword mode remains usable

### Requirement: Chunk search results trace exact source locations
Each search hit SHALL return its chunk identifier, chunk index, start/end offsets, excerpt, material and knowledge-entry identifiers, original filename, rank, retrieval contributions, and bounded score metadata. Chunk content and source metadata SHALL be loaded under the authenticated class predicate.

#### Scenario: Hit can be traced to material text
- **WHEN** a search hit is returned
- **THEN** its excerpt and offsets resolve to the same-class stored chunk and related material

#### Scenario: Cross-class search appears as no hit
- **WHEN** a class-A user searches text represented only in class B, including with a forged class value
- **THEN** the server returns HTTP 200 with no class-B hits, scores, excerpts, or identifiers
