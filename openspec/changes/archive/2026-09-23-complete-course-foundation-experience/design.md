# Design

## Context

The archived lesson-3 and lesson-4 changes now provide main specifications for authentication, class authorization, ingestion, retrieval, and Compose operations. The implementation uses Fastify/TypeScript, PostgreSQL 17 with pgvector, server-side sessions, filesystem-backed material storage, and server-generated HTML. The course reference implementation uses different technologies in places, but explicitly permits an equivalent stack when the repository design and scenarios remain coherent.

The current backend already rejects unauthenticated retrieval and class-scopes object reads. The remaining gaps are primarily missing course acceptance operations and browser behavior, plus a mismatch between the documented pgvector/full-text design and the current application-side JSON-vector/`LIKE` retrieval implementation.

## Goals / Non-Goals

**Goals:**

- Complete the lesson-3 success and failure paths without weakening current lesson-4 behavior.
- Make the same-class teacher/student demonstration reproducible from a fresh Compose volume.
- Keep every object, file, retrieval, and upload authorization decision on the server.
- Make the material browser usable enough to demonstrate role differences, safe content, downloads, and interaction feedback.
- Move lexical and vector candidate ranking into PostgreSQL while preserving deterministic RRF and fallback.
- Leave versioned evidence and archive-ready OpenSpec artifacts.

**Non-Goals:**

- Self-service registration, password reset, SSO, OAuth, JWT, or a platform administrator.
- LLM-generated answers, assistant conversation, skills, MCP, assignments, grading, or audit dashboards.
- Public internet deployment, Kubernetes, multiple application replicas, or production ANN/vector-cluster tuning.
- Replacing Fastify/PostgreSQL with the tutorial's illustrative Go/MySQL/Nginx stack.

## Decisions

### 1. Preserve server-side sessions and add explicit identity/logout operations

`GET /api/me` will expose the same trusted identity already available internally, while the existing `/api/session` may remain as a compatibility alias. `POST /api/logout` will hash the presented opaque token, delete that session row, clear the cookie with matching path/security attributes, and return a bounded response. Session lookup remains joined to the current user row so role/class changes cannot be overridden by browser state.

For unknown account identifiers, login will run `verifyPassword` against a process-level dummy adaptive hash before returning the existing generic 401 response. This preserves the public response and reduces the obvious early-return timing difference without introducing account creation.

**Alternatives considered:** JWT/logout deny lists were rejected because the current specs require server-side revocable sessions; returning identity from local storage was rejected because role and class must remain server trusted.

### 2. Seed acceptance data with stable natural keys and no destructive reset

The seed command will retain existing accounts for compatibility and add a class-A student plus distinguishable class-A/class-B material and knowledge records. Stable IDs/storage keys or unique natural keys will make seed inserts idempotent. Seed reruns will use conflict-safe inserts and will never delete or update teacher-uploaded rows. Passwords remain environment-provided adaptive hashes; existing user passwords will not be silently overwritten unless the record is newly created.

**Alternatives considered:** deleting/recreating all demo data was rejected because it violates persistence and can destroy uploaded work; relying on manual SQL was rejected because third-party reproduction requires one documented command.

### 3. Separate object lookup from public authorization behavior

Repositories will provide an internal unscoped lookup by object ID for material/entry existence, followed immediately by a service-layer class comparison. Both nonexistent and foreign-class objects map to the same public 404 response. Collection queries remain class-filtered in SQL. File download will authorize the material before resolving its server-generated storage key.

The storage abstraction will gain a read operation that returns bytes/stream only for a previously generated storage identifier under the configured root. The response will use attachment disposition with a sanitized original filename and a conservative text/Markdown content type. Storage keys and absolute paths never leave logs or responses.

**Alternatives considered:** filtering class in the object SQL also yields 404 and is secure, but the explicit fetch-then-check path matches the course's object-path reasoning and supports security logging without changing public behavior. Static `/uploads` exposure was rejected because it bypasses sessions and class checks.

### 4. Keep the browser implementation server-hosted but isolate rendering helpers

The application will continue serving HTML from Fastify to avoid introducing a separate frontend build solely for this course increment. The page module will be split into reusable escaping/rendering helpers rather than growing one unstructured template.

Material detail will use a maintained Markdown parser configured for GFM plus an HTML sanitizer. Plain text uses escaped preformatted rendering. The browser will request only authenticated APIs and will never receive storage paths or provider secrets.

Role-appropriate UI is based on `/api/me`: teachers see upload; students do not. The API still enforces teacher-only upload. Theme and view preferences may use local storage because they are non-security presentation settings; identity, role, class, and authorization decisions may not.

Upload progress will use `XMLHttpRequest.upload.onprogress`, because the standard Fetch API does not currently expose upload progress consistently. A small in-page command palette will expose refresh, search focus, theme, view, upload (teacher only), and logout commands. Toasts will translate known status codes into bounded messages.

**Alternatives considered:** a React/Vite rewrite was rejected as unnecessary migration risk; rendering unsanitized Markdown in the browser was rejected due script injection; hiding upload without server RBAC was rejected as insufficient authorization.

### 5. Use PostgreSQL-native lexical and pgvector candidate queries

Ready document embeddings will be persisted in the existing `embedding vector` column. `embedding_json` may be retained temporarily for rollback/inspection but will not drive normal candidate ranking. The repository will format validated numeric vectors for PostgreSQL's vector input and reject non-finite or inconsistent dimensions before persistence.

Lexical candidates will use the generated `search_vector`, `websearch_to_tsquery`/`plainto_tsquery`, `ts_rank_cd`, class predicates, bounded limits, and deterministic ID ties. Vector candidates will use `embedding <=> $queryVector::vector`, current model/status/class predicates, bounded limits, and deterministic ID ties. Exact pgvector distance ordering is acceptable for the classroom corpus; ANN indexing is deferred until one fixed production dimension and a larger corpus justify it.

RRF remains application-side because it combines two already bounded, class-scoped ranked sets and keeps the documented deterministic behavior. Query-embedding failures continue to skip only the vector query and return lexical fallback. Database failures return generic 503.

**Alternatives considered:** application-side cosine over JSON was rejected because it does not demonstrate vector-database retrieval and scales with every scoped ready row; global candidate retrieval followed by filtering was rejected due ranking and leakage risk.

### 6. Verify through unit, integration, browser-shape, and real Compose checks

`pg-mem` remains useful for portable repository and authorization tests but does not represent PostgreSQL full-text/pgvector semantics. Real query, migration, vector persistence, and plan checks will run against the Compose database. Browser acceptance will test rendered page markers and API behavior; manual visual screenshots remain optional evidence, not the authorization proof.

The README and `docs/` verification record will map course checks to commands and expected status codes. All tasks must pass before archiving; archive will sync the six delta capabilities into main specs.

## Risks / Trade-offs

- **[Risk] Seed additions conflict with existing local data** → Use stable conflict-safe inserts and never overwrite uploaded materials or existing account hashes.
- **[Risk] Fetch-then-check can accidentally disclose foreign metadata in logs** → Log only operation/result identifiers after redaction and keep the same public 404 shape.
- **[Risk] Markdown sanitization removes desired formatting** → Enable a conservative GFM subset and test headings, lists, links, code, and embedded script payloads.
- **[Risk] pgvector dimensions differ after model changes** → Validate each provider response and reindex stale-model rows; reject mixed dimensions before database writes.
- **[Risk] Exact vector ordering becomes slow on a large corpus** → Keep class/model/status predicates and candidate limits; document ANN as a future production optimization.
- **[Risk] Browser template complexity grows** → Separate page markup, escaping/rendering, and client behavior into focused modules while retaining the current deployment shape.

## Migration Plan

1. Add session deletion, storage read, object lookup, and seed support with tests while retaining existing APIs.
2. Add `/api/me`, logout, protected detail/file routes, and verify 401/403/404 behavior.
3. Add safe Markdown/detail helpers and replace the materials page with role-aware interactions.
4. Add a versioned retrieval migration/backfill that populates `embedding vector` from valid current data when possible; failed or missing vectors remain retryable and lexical-searchable.
5. Switch lexical/vector repository queries to PostgreSQL-native ranking and run real Compose query-plan and persistence checks.
6. Update README/evidence, run all automated and Compose acceptance paths, validate OpenSpec, then sync and archive.

Rollback can disable the new browser routes and revert retrieval reads to lexical-only while retaining files, materials, knowledge entries, sessions, and additive vector columns. It must not require deleting named volumes or uploaded files.
