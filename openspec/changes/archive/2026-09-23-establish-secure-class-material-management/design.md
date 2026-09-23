# Design

## Context

The repository currently contains project scope and OpenSpec structure but no business implementation, established framework, or existing database schema. This is therefore a greenfield foundation spanning identity, authorization, persistence, file storage, HTTP behavior, and local container operations. See `proposal.md` for motivation and the capability specs for observable behavior.

The design must preserve two non-negotiable security boundaries:

1. Identity, role, and class scope are established by the server rather than trusted from request data.
2. Class filtering and teacher-only upload authorization are enforced at the server/data-access boundary rather than by frontend visibility.

## Goals / Non-Goals

**Goals:**

- Define an implementation shape that can satisfy all four capability specs without coupling acceptance criteria to a particular web framework.
- Make authorization rules reusable and difficult to bypass across routes.
- Keep file persistence and database state consistent when ingestion partially fails.
- Provide a reproducible single-host development deployment through Docker Compose.
- Make security-sensitive configuration explicit and fail closed when it is absent.

**Non-Goals:**

- Selecting or designing retrieval, embedding, vector database, or AI components.
- Designing user self-service registration, password reset, SSO, homework workflows, or production high availability.
- Defining production-scale object storage, distributed transactions, or zero-downtime migration infrastructure.

## Decisions

### 1. Use a single server application with a relational database and durable material storage

The first iteration will use one server application as the only trusted entry point for login, protected reads, uploads, and health checks. A relational database will hold users, classes, sessions, materials, and knowledge entries. Uploaded files will use an application-managed durable storage directory backed by a Docker volume.

This shape keeps authentication, role checks, class scoping, and ingestion transactions in one security boundary while remaining replaceable later.

**Alternatives considered:**

- Separate identity, material, and ingestion services: rejected for the first iteration because distributed authorization and failure handling add complexity without a current scaling requirement.
- Database binary storage for uploaded files: rejected because ordinary durable file storage is simpler for `.txt` and `.md` content in this iteration.
- External object storage: deferred because it adds credentials and infrastructure outside the Docker Compose baseline.

### 2. Use server-side sessions with an opaque cookie

On successful login, the server will create a session record associated with `user_id`, `role`, `class_id`, creation time, and expiry. The browser receives only an opaque, unpredictable session identifier in an `HttpOnly` cookie. The cookie will use `SameSite=Lax` and will be marked `Secure` whenever HTTPS is enabled.

The server loads trusted identity from the session record on each protected request. Request body, query, path, or header claims for identity, role, or class never replace session values. Session key material and cookie-signing or protection secrets are loaded from required environment variables, and startup fails if they are missing or invalid.

**Alternatives considered:**

- Self-contained client tokens: not selected because revocation and stale role/class membership are harder to manage in the first iteration.
- Client-supplied user or class identifiers: rejected because they would undermine authorization and class isolation.

### 3. Use an adaptive salted password hash

Passwords will be stored with a memory-hard adaptive password hashing algorithm such as Argon2id, including a unique salt and algorithm parameters in the encoded hash. Authentication compares the submitted password through the password-hash verifier. Password values are excluded from application logs and error details.

**Alternatives considered:**

- Plain hashes such as SHA-256: rejected because they are too fast and lack password-specific work factors.
- Reversible encryption: rejected because password verification does not require recovering plaintext.

### 4. Centralize authentication, role, and class-scoping policy

Protected routes will pass through authentication middleware that resolves the session context. Teacher-only routes will additionally pass through a role guard that returns HTTP 403 for authenticated non-teachers.

Material and knowledge-entry repositories/services will require the trusted `class_id` as an input and include it in every read predicate. Direct lookups use both resource ID and class ID, returning HTTP 404 when no row matches, which avoids confirming that another class's resource exists. Upload code never accepts an effective class ID from the request.

Frontend controls may improve usability, but they are not security controls.

**Alternatives considered:**

- Route-by-route ad hoc checks: rejected because checks are easy to omit.
- Fetching by resource ID and checking class afterward: rejected because it increases accidental disclosure risk and makes query-level isolation less consistent.
- Returning HTTP 403 for cross-class objects: rejected in favor of HTTP 404 to avoid exposing resource existence.

### 5. Model explicit class ownership and relational integrity

The minimum logical model is:

- `classes`: class identity.
- `users`: account identifier, password hash, role constrained to `teacher|student`, and required `class_id`.
- `sessions`: opaque session identifier or its hash, required `user_id`, trusted role/class snapshot or resolvable user relationship, and expiry.
- `materials`: uploader user ID, required `class_id`, original filename, server-generated storage key/path, file type, size, and timestamps.
- `knowledge_entries`: required material ID, required `class_id`, non-empty parsed text, sequence/order metadata if content is split, and timestamps.

Foreign keys connect users to classes, materials to uploader/classes, and knowledge entries to materials/classes. Service validation additionally ensures a knowledge entry's class matches its material's class.

**Alternatives considered:**

- Inferring class only through uploader relationships: rejected because explicit `class_id` makes tenant filters mandatory and auditable for both materials and knowledge entries.

### 6. Treat ingestion as a coordinated unit of work

The upload pipeline is:

1. Authenticate and require the `teacher` role.
2. Validate extension, non-empty content, configured size limit, and UTF-8 decoding.
3. Generate a server-controlled storage key and durably write the file without using the original filename as a path.
4. Parse the text into one or more non-empty knowledge-entry payloads.
5. In one database transaction, insert the material and linked knowledge entries using the session's `class_id`.
6. Return success only after durable storage and the database transaction complete.

Validation happens before durable writes. If storage fails, no database transaction begins. If parsing or database work fails after writing the file, the transaction rolls back and the server removes the new file; if immediate deletion fails, the file is marked/quarantined for cleanup and is never exposed as an available material.

For this iteration, Markdown parsing preserves textual Markdown content; it does not render HTML, execute embedded content, generate embeddings, or perform retrieval indexing.

**Alternatives considered:**

- Creating the material row before validation/storage: rejected because it produces partial visible records.
- Trusting filename extensions alone: rejected; accepted files must also be valid non-empty UTF-8 and respect the size limit.
- Asynchronous ingestion: deferred because the required first-iteration behavior is easier to make deterministic and testable synchronously.

### 7. Use environment-driven configuration and Docker volumes

Runtime configuration will include at least the database connection, required session secret, upload-size limit, and material storage root. Docker Compose will define the application, database, persistent database volume, persistent material volume, environment wiring, service dependencies, and an application health check that calls `GET /health`.

No insecure default session secret will be provided. A non-secret example environment file may document required variable names, but real secrets remain outside version-controlled source and container images.

**Alternatives considered:**

- Hard-coded development secrets: rejected because they are likely to leak into non-development deployments.
- Host-installed database or storage paths: rejected because they would violate reproducible Compose startup.

### 8. Keep `/health` as a liveness contract

`GET /health` will be unauthenticated and return a small JSON response such as `{"status":"ok"}` with HTTP 200 whenever the application process can serve requests. Docker Compose will use this endpoint for application-container health.

Dependency-readiness checks may be added separately later; the first contract intentionally avoids exposing dependency details or sensitive configuration in the health response.

**Alternatives considered:**

- Protecting the health route with login: rejected because container orchestration must probe it without a user session.
- Returning configuration or database details: rejected to minimize information disclosure.

## Risks / Trade-offs

- **[Risk] File storage and database cannot share a native transaction** → Validate before writing, use one database transaction, delete/quarantine files on downstream failure, and test compensation paths.
- **[Risk] Role or class changes could leave stale session attributes** → Resolve current user authorization from the session-associated user record or invalidate active sessions when role/class membership changes.
- **[Risk] Missing class predicates could cause tenant leakage** → Centralize repositories/services around required trusted `class_id` arguments and add negative integration tests for direct IDs, lists, request overrides, and knowledge-entry access.
- **[Risk] Synchronous parsing increases request latency** → Keep the accepted file size bounded and parsing limited to text; revisit asynchronous processing only when scale requires it.
- **[Risk] Local Docker volumes are not production-grade storage** → Treat Compose as the required development/runtime baseline, not a high-availability production architecture.
- **[Risk] Markdown may contain unsafe constructs if rendered later** → Store and expose parsed text only in this change; any future HTML rendering must add an explicit sanitization specification.

## Migration Plan

1. Add the application and persistence schema through versioned database migrations.
2. Provision initial classes and teacher/student accounts using an administrative seed or bootstrap process that hashes passwords before persistence.
3. Configure required environment variables and persistent Docker volumes.
4. Start the stack with Docker Compose and verify schema migration and `GET /health`.
5. Run authentication, authorization, class-isolation, upload, failure-path, persistence, and container-recreation verification before enabling users.

Rollback consists of stopping the Compose stack and reverting the application version and corresponding database migration while retaining volumes. Destructive rollback of user records or uploaded files requires an explicit backup/restore decision and is not automated by this change.
