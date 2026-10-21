# Proposal

## Why

The repository already provides class-scoped material retrieval, but the lesson-4 and lesson-5 assignments require the retrieved evidence to drive an AI answer and then a persistent, prompt- and skill-controlled streaming assistant. The submitted evidence must also demonstrate token-based login by showing protected browser requests carrying `Authorization: Bearer <token>` without weakening the existing class boundary.

## What Changes

- Add a JWT Bearer authentication option for teacher and student login. The browser will use the access token on protected API requests so DevTools can show the Authorization header required by the assignment, while existing server-side Session Cookie compatibility remains available.
- Add trusted JWT claims and revocation/session checks so `user_id`, `role`, and `class_id` remain server controlled; forged, expired, malformed, or revoked tokens return HTTP 401.
- Add explicit knowledge chunk records with chunk index and character range, supporting automatic overlapping windows, custom separator splitting, and Markdown heading splitting plus reindexing.
- Add keyword, vector, and hybrid search modes with class-scoped filtering, score thresholds, deterministic RRF, and traceable chunk-level hits.
- Add `POST /api/ask`: hybrid-search the authenticated class, take at most four chunks, call an OpenAI-compatible chat model only when evidence exists, generate a short answer containing `[1]`, `[2]` citations, and return citations in the same order. No-hit questions return `资料中未找到相关内容` with no model call.
- Add teacher-managed assistant system prompt and one teacher-controlled `guided-solving` skill. Students may use but may not modify either configuration.
- Add persistent conversations/messages and an SSE answer operation for continuous student follow-up. Each answer uses the saved prompt, current skill state, authenticated class retrieval, and bounded conversation history.
- Add a browser knowledge-answer page modeled on the supplied teacher screenshots: visible teacher/student identity, materials navigation, search/answer modes, cited evidence cards, conversation history, streaming status, theme/logout controls, and Bearer-authenticated requests.
- Add Compose/runtime configuration, automated tests, screenshot evidence, and README instructions for the chat provider, JWT secret/TTL, token inspection, grounded no-hit behavior, prompt/skill controls, and SSE verification.

## Capabilities

### New Capabilities
- `grounded-knowledge-question-answering`: Evidence-gated non-streaming AI answers with ordered citations and fixed no-hit behavior.
- `assistant-configuration-and-skills`: Teacher-managed assistant prompt and guided-solving skill with student read/use-only permissions.
- `streaming-assistant-conversations`: Persisted class-scoped conversations and SSE-delivered follow-up answers.

### Modified Capabilities
- `account-authentication`: Add JWT Bearer issuance, validation, protected-request authentication, and revocation while preserving current Session Cookie compatibility.
- `class-scoped-knowledge-retrieval`: Add explicit chunking/reindex strategies, keyword/vector/hybrid modes, thresholds, chunk offsets, and chunk-level source responses required by RAG.
- `material-browser-experience`: Add token-authenticated search/answer navigation, citation cards, teacher configuration controls, and streaming conversation UI.
- `service-operations`: Add JWT/chat provider configuration, startup validation, Compose verification, and assignment screenshot evidence requirements.

## Impact

Affected areas include authentication middleware and session storage, JWT signing/verification, database migrations for chunks, assistant configuration, conversations and messages, ingestion/reindex workflows, retrieval repositories, OpenAI-compatible embedding/chat adapters, SSE routes, browser templates and token storage/request wrappers, Compose/environment configuration, README/evidence documentation, automated tests, and OpenSpec main specifications after archive. Real provider credentials remain server-side and must not be committed or shown in screenshots.
