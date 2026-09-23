# Proposal

## Why

The current repository implements the core lesson-3 and lesson-4 security and retrieval paths, but it does not yet satisfy several explicit course acceptance paths: logout and `/api/me`, protected file download, same-class student demonstration data, safe material presentation, role-appropriate browser behavior, and database-native PostgreSQL full-text/pgvector retrieval. Completing these gaps now makes the public repository reproducible from the earlier lesson slides and prevents the UI or documentation from overstating what the backend actually enforces.

## What Changes

- Add authenticated identity and logout operations: `GET /api/me` restores trusted user/role/class state, while `POST /api/logout` deletes the server-side session, clears the cookie, and makes the old cookie unusable.
- Make invalid-account login perform an equivalent password-hash verification path so the generic failure response is not paired with a trivially different code path.
- Extend idempotent seed data with a teacher and student in class A, a student in class B, and distinguishable class-A/class-B material and knowledge records without overwriting uploaded data.
- Add protected same-class file download and material detail behavior; teachers and students may view/download their own class, while cross-class and nonexistent identifiers return the same HTTP 404 shape.
- Add a course-aligned authenticated material experience: role-aware upload visibility, logout, safe Markdown rendering, responsive list/grid views, local same-class filtering, light/dark theme, keyboard command palette, upload progress, and toast/error feedback.
- Replace the current compatibility-only retrieval implementation with PostgreSQL-native full-text ranking and pgvector distance queries, persisting ready embeddings into the `vector` column while retaining class/model/status predicates and lexical fallback.
- Complete README and verification evidence for seeded accounts, single-instance Compose, protected downloads, response codes, failure paths, and third-party reproduction.
- Archive this change after all scenarios and verification tasks pass so its deltas become the next main-spec baseline.

## Capabilities

### New Capabilities
- `material-browser-experience`: Authenticated, role-aware material browsing, safe detail rendering, view controls, feedback, and keyboard interactions required by the course UI acceptance path.

### Modified Capabilities
- `account-authentication`: Add trusted current-user restoration, logout/session revocation, and equivalent invalid-account password verification behavior.
- `material-ingestion`: Add idempotent, distinguishable two-class demonstration content and secure retrieval of the durable uploaded file.
- `role-and-class-authorization`: Define same-class view/download permissions and indistinguishable 404 behavior for cross-class object and file access.
- `service-operations`: Expand the reproducible Compose/README contract and acceptance evidence required for third-party startup and persistence checks.
- `class-scoped-knowledge-retrieval`: Require database-native PostgreSQL full-text ranking and pgvector persistence/query execution instead of application-side JSON-vector scanning.

## Impact

Affected areas include Fastify authentication and material routes, session and material repositories, seed initialization, durable file storage, browser templates and client JavaScript, PostgreSQL migrations and retrieval SQL, Compose/runtime configuration, automated tests, README documentation, and OpenSpec verification/archive state. A Markdown rendering dependency may be added only if it is configured to escape or sanitize embedded HTML. Existing `/api/session` compatibility may be retained while `/api/me` becomes the documented browser identity endpoint.
