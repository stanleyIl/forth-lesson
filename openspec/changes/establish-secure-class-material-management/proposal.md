# Proposal

## Why

CampusClaw needs a secure, testable foundation for its first teaching-material workflow before business implementation begins. This change defines the authentication, authorization, class isolation, material ingestion, and operability contracts required for the first iteration.

## What Changes

- Add account/password login for teachers and students, with safely hashed passwords and server-managed sessions.
- Require authentication for protected resources and retain `user_id`, `role`, and `class_id` as trusted session identity attributes.
- Add server-side role authorization so only teachers can upload teaching materials; student upload attempts return HTTP 403 even when the API is called directly.
- Make `class` the server-enforced data isolation boundary so users can access materials only for their own `class_id`.
- Add teacher upload of `.txt` and `.md` materials, including validation, durable file storage, text parsing, and creation of linked `materials` and `knowledge_entries` records scoped to the current teacher's `class_id`.
- Require sensitive session configuration to come from server environment variables.
- Define Docker Compose startup and a `GET /health` health-check endpoint.

### Non-goals

- RAG / 检索问答
- AI 对话
- 作业提交与批改
- 注册和密码找回
- SSO
- 生产级高可用

## Capabilities

### New Capabilities

- `account-authentication`: Account/password login, secure password storage, protected-resource behavior, session identity, and environment-provided session secrets.
- `role-and-class-authorization`: Teacher/student authorization and server-enforced class-level data isolation.
- `material-ingestion`: Teacher-only `.txt`/`.md` upload, validation, persistence, parsing, and class-scoped material and knowledge-entry creation.
- `service-operations`: Docker Compose startup and HTTP health checking.

### Modified Capabilities

None. This is the first OpenSpec change and the project has no existing capabilities.

## Impact

- Introduces externally observable login, session, authorization, material upload/read, and health-check behavior.
- Establishes required domain data for users, classes, materials, and knowledge entries, including class ownership relationships.
- Requires server-side authentication middleware, role and tenant authorization, file storage, persistence, configuration loading, and container orchestration during implementation.
- Requires automated verification of successful flows and rejection paths, especially unauthenticated access, student uploads, cross-class reads, invalid files, and missing sensitive configuration.
