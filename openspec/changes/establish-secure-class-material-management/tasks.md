# Tasks

## 1. Application Foundation and Configuration

- [ ] 1.1 Scaffold the single-server application and automated test structure without adding out-of-scope AI, RAG, homework, registration, password-recovery, or SSO features; verify the dependency install, application build/start command, and empty test suite all succeed
- [ ] 1.2 Implement typed/validated runtime configuration for the database connection, required session secret, upload-size limit, material storage root, and session settings; verify configuration tests cover valid values, malformed values, and startup failure when the session secret is missing
- [ ] 1.3 Add safe request/error logging that excludes passwords, session credentials, secret configuration, and uploaded content; verify an automated logging test confirms sensitive values are absent from captured logs

## 2. Persistence Model and Bootstrap Data

- [ ] 2.1 Create versioned migrations for `classes`, `users`, `sessions`, `materials`, and `knowledge_entries` with required foreign keys, role constraints, class relationships, non-empty content constraints, and useful class-scoped indexes; verify migrations apply cleanly to an empty test database and the resulting schema enforces invalid-role and broken-relationship failures
- [ ] 2.2 Implement the password hashing/verifying service using an adaptive salted password hash such as Argon2id; verify unit tests cover successful verification, incorrect-password rejection, different encoded hashes for the same password, and absence of plaintext persistence
- [ ] 2.3 Add an administrative seed/bootstrap path for at least one teacher and one student in separate testable classes, ensuring all seeded credentials are hashed; verify the seed can run on an empty database and no plaintext password is stored
- [ ] 2.4 Implement persistence helpers for sessions, materials, and knowledge entries with required trusted `class_id` inputs; verify repository tests prove direct material and knowledge-entry lookups and listings always include class scope

## 3. Authentication and Session Enforcement

- [ ] 3.1 Implement account/password login for teacher and student accounts, creating an opaque server-side session and secure cookie on success; verify integration tests cover successful teacher login, successful student login, generic HTTP 401 responses for unknown accounts and wrong passwords, and no credential leakage
- [ ] 3.2 Implement session loading that establishes trusted `user_id`, `role`, and `class_id` for each authenticated request and rejects missing, invalid, expired, or tampered credentials; verify middleware tests cover all accepted and rejected session states
- [ ] 3.3 Apply authentication enforcement to protected APIs and protected browser pages while exempting login and health routes; verify unauthenticated API requests return HTTP 401, unauthenticated page requests redirect to login without protected content, and authenticated requests continue to authorization checks
- [ ] 3.4 Ensure request parameters, bodies, and headers cannot override session identity, role, or class; verify negative integration tests submit forged `user_id`, `role`, and `class_id` values and observe authorization based only on the trusted session

## 4. Role Authorization and Class Isolation

- [ ] 4.1 Implement a centralized teacher-role authorization guard for material upload; verify a teacher reaches upload validation, a student calling the API directly receives HTTP 403, and denied requests create no file or database records
- [ ] 4.2 Implement class-scoped material list and direct-read operations using the session `class_id` in the data query; verify same-class reads succeed, lists contain only same-class rows, and class A direct reads of class B material return HTTP 404 without metadata or content
- [ ] 4.3 Apply equivalent class scoping to all knowledge-entry access paths; verify same-class knowledge content can be returned through allowed material reads and class A requests for class B entries return HTTP 404
- [ ] 4.4 Add adversarial authorization tests that try query, route, body, and header class overrides plus direct cross-class resource IDs; verify no test can disclose or modify another class's material or knowledge data

## 5. Material Validation and Durable Storage

- [ ] 5.1 Implement upload validation for `.txt` and `.md`, non-empty content, valid UTF-8, and the configured size limit; verify tests cover accepted text/Markdown files and HTTP 415, 400, 400, and 413 responses for unsupported type, empty content, invalid encoding, and oversized content respectively
- [ ] 5.2 Implement durable application-managed file storage with server-generated storage keys and original filenames retained only as metadata; verify storage tests confirm successful persistence and that traversal/path-separator filenames cannot escape the configured storage root
- [ ] 5.3 Implement storage failure handling before database creation; verify a forced write failure returns an error and leaves no uploaded file, `materials` row, or `knowledge_entries` row

## 6. Parsing and Atomic Ingestion

- [ ] 6.1 Implement UTF-8 text extraction for `.txt` and `.md` files that yields one or more ordered, non-empty knowledge-entry payloads while preserving Markdown as text; verify parser tests cover representative text, Markdown, whitespace-only output, and parser failure
- [ ] 6.2 Implement the ingestion service that writes the validated file, parses it, and creates exactly one material plus linked knowledge entries in one database transaction using the authenticated teacher's `class_id`; verify a successful upload persists the file and all linked records with matching material ID and class ID
- [ ] 6.3 Implement compensation for parsing or database failure after file creation by rolling back records and deleting or quarantining the file; verify fault-injection tests leave no available partial material, knowledge entry, or orphaned usable file
- [ ] 6.4 Expose the teacher upload API through authentication and role middleware without accepting an effective class from the client; verify end-to-end tests cover successful `.txt` and `.md` uploads, client-supplied foreign `class_id` being ignored, student HTTP 403, and unauthenticated HTTP 401

## 7. Health Check and Docker Compose

- [ ] 7.1 Implement unauthenticated `GET /health` returning HTTP 200 and machine-readable healthy JSON when the application can serve requests; verify route tests cover the exact method/path, response status/body, and access without a session
- [ ] 7.2 Add an application container build and Docker Compose services for the application and relational database, with environment wiring, startup dependencies, and a health check that calls `GET /health`; verify the documented Compose build and startup command reaches a healthy state from a clean checkout
- [ ] 7.3 Add named persistent volumes for database data and uploaded materials; verify an integration run uploads a material, recreates the application container without deleting volumes, and can still read the committed record and stored file
- [ ] 7.4 Add a non-secret example environment file and startup documentation listing every required variable without embedding a real session secret; verify the stack starts with documented valid values and fails clearly when the required session secret is omitted

## 8. Acceptance and Regression Verification

- [ ] 8.1 Create a full acceptance suite mapping each scenario in `account-authentication`, `role-and-class-authorization`, `material-ingestion`, and `service-operations` to an automated test or documented container verification; verify every scenario has an explicit passing evidence reference
- [ ] 8.2 Run the complete unit, integration, migration, security, and Compose acceptance checks; verify all checks pass and retain the command output or CI result as implementation evidence before marking any task complete
- [ ] 8.3 Review the implementation against the declared non-goals and server-side security boundaries; verify no RAG/AI/homework/registration/password-recovery/SSO/HA scope was introduced and no authorization or class isolation depends only on frontend behavior
