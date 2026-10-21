# Tasks

## 1. Configuration and Dependencies

- [x] 1.1 Add JWT, chat provider, chunking, similarity threshold, question/answer, and conversation-history runtime configuration with safe bounds; verify valid values load and missing/unsafe JWT or AI settings fail as specified
- [x] 1.2 Add maintained JWT signing/verification dependency and any SSE parsing support without exposing browser signing capability; verify lockfile audit and TypeScript build pass
- [x] 1.3 Extend logger redaction for access tokens, JWT claims/jti, chat credentials, system prompts, full questions/history, generated answers, and provider payloads; verify captured logs retain operation metadata only
- [x] 1.4 Define module boundaries for token authentication, chunking, search modes, chat provider, grounded ask, assistant configuration, conversations, and SSE framing; verify existing 70-test regression suite passes before behavior changes

## 2. JWT Bearer Authentication

- [x] 2.1 Add a versioned `access_token_sessions` migration with hashed jti, user relation, expiry, revocation, and indexes; verify migration preserves existing Cookie sessions and users
- [x] 2.2 Implement HS256 token issuance with validated issuer/audience/TTL and minimal trusted claims; verify teacher/student token claims and rejection of unsupported algorithms or weak configuration
- [x] 2.3 Persist token-session jti hashes and implement revocation/expiry lookup joined to the current user; verify raw jti/token values are never stored and revoked tokens fail
- [x] 2.4 Extend login to return `accessToken`, `tokenType`, and expiry while preserving the existing HttpOnly Cookie; verify invalid credentials create neither Cookie nor token session
- [x] 2.5 Add Bearer authentication middleware precedence over Cookie fallback, and verify valid token access plus missing, malformed, tampered, expired, revoked, and Cookie/Bearer-conflict cases
- [x] 2.6 Extend logout to revoke the current Bearer jti and clear Cookie state; verify reusing the same token and Cookie returns HTTP 401
- [x] 2.7 Add adversarial tests proving token/body/query/header class and role claims cannot expand scope and unsupported token identities fail closed

## 3. Chunk Schema and Index Lifecycle

- [x] 3.1 Add versioned `knowledge_chunks` and `knowledge_chunk_embeddings` migrations with entry/material/class relations, generation/strategy/index/offset/status/error metadata, pgvector values, timestamps, constraints, and cascade deletion; verify migration on existing data
- [x] 3.2 Implement preprocessing that preserves original knowledge-entry content while producing indexed text and documented indexed-text offsets; verify link/whitespace options never rewrite source records
- [x] 3.3 Implement automatic window chunking with configured maximum and overlap; verify empty, short, boundary, multi-window, and overlap cases
- [x] 3.4 Implement bounded custom-separator chunking for newline, blank line, punctuation, and safe literal separators; verify empty segments are removed and offsets/order remain stable
- [x] 3.5 Implement Markdown heading chunking that retains `#`/`##`/`###` headings and auto-splits oversized sections; verify nested headings and long-section behavior
- [x] 3.6 Implement idempotent chunk embedding persistence keyed by chunk ID/model with pending/ready/failed lifecycle and finite/dimension validation; verify retry and model replacement never duplicate eligible vectors
- [x] 3.7 Implement material reindex as a replacement generation controlled by same-class teacher authorization; verify old chunks/vectors become ineligible, successful generation replaces them, and failed rebuild leaves a consistent recoverable state
- [x] 3.8 Backfill existing knowledge entries with default automatic chunks and embeddings; verify repeated runs skip current ready chunks and report processed/ready/failed/skipped counts

## 4. Explicit Search Modes

- [x] 4.1 Add `POST /api/search` validation for `q`, `mode`, `limit`, and `offset`, ignoring client identity/class/source claims; verify empty/oversized/invalid-mode/out-of-range requests return HTTP 400
- [x] 4.2 Implement keyword chunk search using PostgreSQL full text, ready/class filters, bounded pagination, excerpts, source offsets, and deterministic ranking; verify no embedding-provider call occurs
- [x] 4.3 Implement vector chunk search using query embedding, class/model/status filters, pgvector distance, configured similarity threshold, bounded pagination, and deterministic ranking; verify weak, foreign, stale, failed, and null vectors are excluded
- [x] 4.4 Implement hybrid chunk search with independently filtered channels and deterministic RRF `k=60`; verify deduplication, channel ranks, ties, pagination, and threshold behavior
- [x] 4.5 Implement mode-specific dependency failures so keyword remains available while vector/hybrid return generic HTTP 503 when required vector services fail; verify no fabricated scores or provider details
- [x] 4.6 Return chunk-level traceability fields including chunk ID/index, indexed-text offsets, excerpt, material/entry IDs, filename, rank, channel scores, and mode; verify each hit resolves under the same class

## 5. Grounded Non-Streaming AI Answer

- [x] 5.1 Implement an OpenAI-compatible chat adapter with model identity, optional authorization, timeout, bounded output, strict response validation, and test injection; verify success, timeout, provider error, malformed response, and credential redaction
- [x] 5.2 Implement bounded question validation and `POST /api/ask` authenticated routing using hybrid search limit four; verify teachers/students succeed and unauthenticated requests return HTTP 401
- [x] 5.3 Implement the no-hit branch returning `资料中未找到相关内容` and empty citations without calling chat provider; verify provider call count is zero for unrelated questions
- [x] 5.4 Compose server-controlled numbered evidence from filename, chunk index, offsets, and text without vectors/foreign data/client system messages; verify fake-provider captured input contains only allowed values
- [x] 5.5 Generate a short grounded answer and ordered citations with `[1]`, `[2]` mapping; verify response source objects and marker order match the selected top-four chunks
- [x] 5.6 Return generic HTTP 503 when evidence exists but chat generation fails; verify no answer/citation fabrication, provider secret, raw payload, or stack detail leaves the service

## 6. Assistant Prompt and Guided-Solving Skill

- [x] 6.1 Add class-scoped `assistant_configs` migration and safe default prompt/skill seed; verify every seeded class has one configuration without duplicate rows
- [x] 6.2 Add authenticated configuration read operation with safe student-visible fields; verify class A cannot read class B configuration
- [x] 6.3 Add teacher-only prompt update with length/content validation and trusted class scope; verify student HTTP 403, forged class ignored, and next request uses new prompt
- [x] 6.4 Add teacher-only `guided-solving` toggle; verify enabled requests include hint/no-final-answer instructions, disabled requests omit them, and student updates return HTTP 403
- [x] 6.5 Build one provider request from saved prompt, current skill state, numbered evidence, bounded history, and current question; verify all three lesson inputs participate in the same answer

## 7. Persistent Conversations and SSE

- [x] 7.1 Add `conversations` and `conversation_messages` migrations with owner/class relations, role/status/content/citations, timestamps, indexes, and cascade behavior; verify existing data is preserved
- [x] 7.2 Implement create/list/detail conversation operations scoped to authenticated user and class; verify foreign/missing IDs return identical HTTP 404
- [x] 7.3 Persist ordered user and completed assistant messages with citation JSON; verify reopening a conversation restores content and sources in order
- [x] 7.4 Implement bounded persisted history loading by count and characters while discarding client-forged system/assistant history; verify provider input uses only allowed stored messages
- [x] 7.5 Implement authenticated SSE POST framing for `meta`, `citation`, `delta`, `done`, and generic `error` events; verify content type, event ordering, multiline safety, and disconnect handling
- [x] 7.6 Implement streaming evidence/no-hit/provider-failure branches and message status transitions; verify no-hit skips provider, success persists done content, and failed streams do not persist fabricated completion
- [x] 7.7 Add concurrent/abort tests proving one conversation stream cannot write into another user's conversation and cancellation leaves consistent message state

## 8. Browser Token and Assistant Experience

- [x] 8.1 Refactor browser API wrapper to keep access token in sessionStorage, attach Authorization Bearer to protected fetch/XHR calls, and clear token on logout/401; verify identity/role/class/provider keys are not trusted from storage
- [x] 8.2 Update login page to receive token and navigate into the authenticated app while retaining Cookie compatibility; verify DevTools-visible protected request contains Bearer header
- [x] 8.3 Add separate knowledge-search and knowledge-answer modes modeled on the teacher example, with question/answer bubbles, retrieval mode, citation markers, and source cards linking to allowed materials
- [x] 8.4 Add conversation list/create/select/follow-up UI and streaming fetch parser that updates assistant text incrementally until done; verify citation cards remain attached to the correct message
- [x] 8.5 Add teacher-only prompt editor and guided-solving toggle plus student read/use-only presentation; verify direct student API modification remains HTTP 403
- [x] 8.6 Preserve materials navigation, theme, command palette, logout, responsive layout, safe rendering, and bounded errors; verify existing browser behavior and token-auth upload/download continue to work
- [x] 8.7 Add browser/security tests for token storage/header, 401 cleanup, answer citations, no-hit display, role controls, SSE deltas, and absence of rendered/raw secrets

## 9. Compose, Documentation, and Assignment Evidence

- [x] 9.1 Add JWT and chat variables to `.env.example`, Compose, and README without real credentials; verify documented valid configuration starts and invalid security bounds fail
- [x] 9.2 Document token login/curl, Authorization inspection, chunk strategies/reindex, three search modes, `/api/ask`, prompt/skill operations, conversations, SSE format, no-hit behavior, and provider failure paths
- [x] 9.3 Add a local OpenAI-compatible fake chat/embedding acceptance fixture or documented command for deterministic tests while clearly distinguishing it from real-provider screenshot evidence
- [x] 9.4 Run Compose migration, seed, chunk backfill, keyword/vector/hybrid search, grounded ask, prompt/skill change, conversation persistence, SSE, restart, and provider outage checks; retain sanitized request/response evidence
- [x] 9.5 Record the user's explicit choice to use the deterministic local OpenAI-compatible mock, verify one evidence-backed answer with correct citations, and confirm no third-party credential is persisted
- [x] 9.6 Capture a local screenshot comparable to the teacher AI-answer example, showing authenticated identity, question, grounded answer, `[1]` citation, and source excerpt; save under ignored `evidence/lesson-4-5/`
- [x] 9.7 Capture a local DevTools Network screenshot comparable to the teacher token example, showing a protected request with Authorization Bearer and corresponding authenticated page identity; ensure no provider key is visible
- [x] 9.8 Keep `repository-url.txt` with the public repository address and verify the final GitHub main branch contains code/spec/docs but not temporary tokens, provider credentials, or ignored screenshots

## 10. Final Security, Verification, and Archive

- [x] 10.1 Add full teacher/student/class permission matrix tests across token login, materials, upload, reindex, search, ask, configuration, conversations, and stream operations
- [x] 10.2 Add adversarial tests for forged JWTs/algorithms/claims, client system messages/history, class/source IDs, citation injection, cross-class chunks/conversations, and token/Cookie conflicts
- [x] 10.3 Audit responses, browser storage, logs, database token rows, committed files, screenshots, and provider payloads for passwords, raw jti/token values, JWT secret, provider key, vectors, foreign content, and SQL/storage details
- [x] 10.4 Map every scenario in all seven delta specs to automated or documented Compose evidence and verify each has an explicit passing reference
- [x] 10.5 Run complete build, unit, integration, migration, JWT, retrieval, RAG, provider, SSE, browser, security, persistence, and Compose acceptance checks; retain summarized output
- [x] 10.6 Run `openspec validate add-jwt-rag-streaming-assistant --strict` and verify zero errors
- [x] 10.7 Review non-goals and verify no refresh-token platform, registration, OAuth/SSO, MCP, assignment/grading, extra skills, queue, or multi-replica behavior was introduced
- [x] 10.8 Sync and archive the completed change, verify active changes are clear, commit, push GitHub main, and confirm the public remote hash
