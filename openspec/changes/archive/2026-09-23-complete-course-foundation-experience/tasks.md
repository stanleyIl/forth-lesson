# Tasks

## 1. Authentication Completion

- [x] 1.1 Add session-repository revocation by hashed token and verify repository tests prove only the selected session is deleted
- [x] 1.2 Add authenticated `GET /api/me` using trusted session identity while retaining `/api/session` compatibility, and verify authenticated teacher/student responses plus unauthenticated HTTP 401
- [x] 1.3 Add `POST /api/logout` that revokes the server-side session and clears the configured cookie, and verify the old cookie receives HTTP 401 after logout
- [x] 1.4 Add an equivalent dummy adaptive-hash verification path for unknown accounts, and verify unknown-account and wrong-password responses remain identical without bypassing password verification
- [x] 1.5 Extend authentication and logging tests to prove session tokens, password values, hashes, and logout internals are absent from responses and logs

## 2. Reproducible Seed and Class Data

- [x] 2.1 Extend seed configuration for documented teacher/student credentials without adding real defaults, and verify missing required seed credentials fail clearly
- [x] 2.2 Seed a class-A teacher, class-A student, class-B student, and distinguishable A/B material plus knowledge records using stable conflict-safe identifiers, and verify role/class/content assignments in SQL
- [x] 2.3 Make the complete seed operation idempotent and non-destructive, and verify two consecutive runs keep user/material/knowledge counts stable and preserve a separately uploaded material
- [x] 2.4 Update seed tests to prove passwords remain adaptive hashes and existing account hashes or uploaded content are not overwritten

## 3. Protected Detail and File Download

- [x] 3.1 Add internal material and knowledge-entry object lookup needed for fetch-then-check authorization, and verify nonexistent and foreign-class objects remain distinguishable only inside the service
- [x] 3.2 Add safe durable-storage reads constrained to server-generated storage keys under the configured root, and verify traversal or arbitrary path input cannot escape the storage directory
- [x] 3.3 Add authenticated material file download with safe attachment filename and text/Markdown content type, and verify teachers and students can download only same-class files
- [x] 3.4 Standardize material detail, file, and knowledge-entry public 404 responses, and verify nonexistent and cross-class identifiers return the same body without metadata, content, storage key, or path leakage
- [x] 3.5 Add failure tests for missing durable files and database/storage errors, and verify only generic 404/503 responses leave the service

## 4. Course-Aligned Material Browser

- [x] 4.1 Refactor page markup, escaping, and client behavior into focused modules while preserving Fastify-hosted deployment, and verify the TypeScript build and existing regression tests pass
- [x] 4.2 Add role restoration through `/api/me`, teacher-only upload rendering, student browsing, and logout navigation, and verify browser-shape tests cover both roles while direct student upload still returns HTTP 403
- [x] 4.3 Add responsive material list/grid modes and local filename/type filtering over the already authorized collection, and verify switching/filtering never sends a client-selected class identifier
- [x] 4.4 Add authenticated material detail and download interactions, and verify a source result opens same-class detail and downloads through the protected file operation
- [x] 4.5 Add GFM Markdown rendering with HTML sanitization plus escaped plain-text rendering, and verify headings/lists/code render while script, event-handler, and unsafe-link payloads do not execute
- [x] 4.6 Add light/dark theme persistence using presentation-only local storage, and verify identity, role, class, and session values are never written there
- [x] 4.7 Add Command/Ctrl+K command palette with refresh, search, view, theme, role-appropriate upload, and logout actions, and verify unavailable student commands are omitted
- [x] 4.8 Replace Fetch upload with XHR progress reporting and add bounded toast/error feedback, and verify success plus 400/401/403/404/413/415 paths are presented without sensitive details

## 5. PostgreSQL-Native Hybrid Retrieval

- [x] 5.1 Add a versioned migration/backfill for valid pgvector persistence and any required constraints/index adjustments, and verify it preserves existing materials, entries, and retryable embedding states
- [x] 5.2 Validate finite vectors and consistent dimensions before persistence, write ready embeddings to the pgvector column, and verify malformed/mixed/non-finite vectors never become ready
- [x] 5.3 Replace lexical `LIKE` scanning with class-scoped PostgreSQL full-text ranking, bounded candidates, excerpts, and deterministic ties, and verify stronger class-B matches never enter class-A candidates
- [x] 5.4 Replace application-side JSON cosine scanning with class/model/status-scoped pgvector distance SQL, bounded candidates, and deterministic ties, and verify cross-class, stale-model, failed, and null vectors are excluded before ranking
- [x] 5.5 Preserve RRF, no-match, source projection, and lexical fallback response contracts, and verify API tests cover dual-channel deduplication plus provider outage
- [x] 5.6 Run Compose `EXPLAIN` and schema checks proving full-text and pgvector work is database-native and bounded, and retain the plans in the verification document

## 6. Documentation and Reproducible Operations

- [x] 6.1 Update `.env.example` and README with complete local setup, single-instance scope, seed variables/accounts, `/api/me`, logout, protected detail/download, retrieval provider configuration, and no real credentials; verify a clean documented configuration starts
- [x] 6.2 Document expected 401/403/class-hiding 404/503 behavior, upload limits/types, persistence, fallback, and non-goals including no registration or administrator; verify a reviewer can identify each behavior from README alone
- [x] 6.3 Update versioned lesson verification evidence with commands and expected outputs for login/logout, same-class student access, download, upload failures, cross-class denial, persistence, full-text, hybrid, fallback, source traceability, and redaction
- [x] 6.4 Recreate application and database containers without deleting named volumes and verify seeded/uploaded files, materials, knowledge entries, sessions as applicable, and embeddings persist according to their contracts

## 7. Security and Acceptance Tests

- [x] 7.1 Add integration tests for teacher, same-class student, and other-class student across list/detail/download/search/upload operations, and verify the complete role/class permission matrix
- [x] 7.2 Add adversarial tests for body/query/header/route identity and class overrides plus direct foreign IDs, and verify responses, logs, ranks, timing-visible source loads, and downloads disclose no foreign data
- [x] 7.3 Add browser tests for login-only public page, role-appropriate controls, safe Markdown, theme, view modes, command palette, upload progress hooks, toast mapping, logout, and 401 redirect
- [x] 7.4 Run secret/content audits proving passwords, cookies, session tokens, provider keys, vectors, full queries/content, SQL errors, storage keys, and paths are absent from client responses, browser storage, logs, and committed files

## 8. Final Verification and Archive

- [x] 8.1 Map every scenario in all six delta specs to an automated test or documented Compose verification and verify every scenario has an explicit passing evidence reference
- [x] 8.2 Run the complete build, unit, integration, migration, security, browser, full-text, pgvector, backfill, persistence, and Compose acceptance suite and retain command output
- [x] 8.3 Run `openspec validate complete-course-foundation-experience --strict` and verify zero errors before marking implementation complete
- [x] 8.4 Review implementation against non-goals and verify no registration, administrator, JWT/OAuth, LLM answer generation, assistant, assignment, skill, MCP, or multi-replica behavior was introduced
- [x] 8.5 Sync and archive the completed change, then verify no active completed change remains and all six capability deltas are present in main specs
