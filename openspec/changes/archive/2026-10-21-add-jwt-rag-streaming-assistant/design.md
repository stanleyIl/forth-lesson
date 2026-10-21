# Design

## Context

The current system has Fastify/TypeScript, PostgreSQL/pgvector, server-side Cookie sessions, class-scoped material ingestion, entry-level retrieval, and a server-hosted browser UI. Lesson 4 now requires explicit chunk records, three retrieval modes, traceable offsets, and evidence-gated short AI answers. Lesson 5 adds teacher-managed prompt/skill configuration, persistent follow-up conversations, and SSE output. The assignment additionally requires a visible Authorization Bearer token flow even though the published week04 prototype still uses same-origin Cookie sessions.

## Goals / Non-Goals

**Goals:**

- Add a demonstrable JWT Bearer path without removing working Cookie compatibility.
- Keep all identity/class/role decisions server-controlled and revocable.
- Implement traceable chunking and mode-specific retrieval suitable for grounded answers.
- Guarantee no-hit questions bypass the generation model.
- Persist prompt, skill, conversation, messages, and citations under class/user scope.
- Stream answers over SSE while retaining evidence order and bounded failure behavior.
- Produce reproducible local screenshots matching the teacher examples without exposing provider secrets.

**Non-Goals:**

- Refresh tokens, OAuth/OIDC, SSO, public registration, password reset, or multi-device token management.
- Autonomous multi-tool agents, MCP, assignment grading, additional skills, asynchronous queues, or emotional-care conversation.
- Replacing PostgreSQL/pgvector with MySQL/Qdrant solely to match the tutorial's illustrative stack.
- Training or hosting a foundation model inside this repository.

## Decisions

### 1. Add revocable HS256 JWT access tokens alongside Cookie sessions

Successful `/api/login` will continue setting the current HttpOnly Cookie and will also return an access token when JWT configuration is enabled. A dedicated token-session table will store a hash of a random JWT `jti`, user ID, expiry, and revocation timestamp. The JWT contains `sub`, `jti`, `role`, `class_id`, `iss`, `aud`, `iat`, and `exp`; authentication loads the token-session and current user row, then rejects role/class claim drift rather than trusting stale or forged claims.

Authentication middleware checks Authorization first when present. An invalid Bearer token returns 401 and never silently falls back to a valid Cookie. Without Authorization, existing Cookie behavior remains. Logout revokes the applicable jti and clears Cookie state.

The browser stores the short-lived demo access token in `sessionStorage`, never stores provider keys, and attaches the header to every protected `fetch`/XHR call. SSE uses streaming `fetch`, not native EventSource, because EventSource cannot set an Authorization header.

**Alternatives considered:** pure stateless JWT was rejected because logout could not revoke the demonstrated token; replacing Cookie authentication was rejected because it would unnecessarily break completed lesson-3 behavior; localStorage was rejected in favor of tab-scoped sessionStorage.

### 2. Introduce chunk and chunk-embedding tables without rewriting original entries

A new migration creates `knowledge_chunks` and `knowledge_chunk_embeddings`. Chunks reference knowledge entry, material, and class; contain strategy, index, text, start/end offsets, status/error, and timestamps. Embeddings use the chunk ID as their primary relation and store model identity plus pgvector value. Existing entry-level embeddings remain available for migration/rollback but new search and answer paths operate on chunks.

The chunker accepts:

- `auto`: default maximum about 800 characters with 80-character overlap, configurable within validated bounds;
- `separator`: newline, blank-line, sentence punctuation, or a bounded literal separator;
- `markdown_heading`: split at `#`/`##`/`###`, retain headings, then auto-split oversized sections.

Preprocessing may collapse whitespace or remove link destinations for indexing, but original `knowledge_entries.content` remains unchanged. Offsets describe the indexed/preprocessed text and are labeled accordingly. Reindex writes a replacement generation transactionally, embeds it, then makes it eligible and removes the previous chunk/vector generation; failed embedding keeps original material and allows keyword-ready chunks according to explicit status rules.

**Alternatives considered:** continuing one entry as one chunk was rejected because the lesson requires chunk index/offset and top-4 evidence; replacing knowledge entries was rejected because original ingestion and traceability must remain stable.

### 3. Add explicit `/api/search` mode semantics while retaining legacy search

`POST /api/search` accepts `{q, mode, limit, offset}` with mode `keyword|vector|hybrid`. Keyword uses PostgreSQL full text only. Vector creates a query embedding and applies pgvector cosine similarity plus threshold `0.35` by default. Hybrid executes both filtered channels and applies RRF `k=60`. All SQL applies authenticated class before ranking and source loading.

Legacy `/api/knowledge-search` remains compatible and may keep its prior fallback contract. New vector/hybrid endpoints return generic 503 when required vector dependencies fail; keyword remains usable. Results are chunk-level and include offsets and source identifiers.

### 4. Implement evidence-gated `/api/ask` with a separate chat adapter

The chat adapter is independent from embedding. It uses an OpenAI-compatible chat-completions endpoint, server-controlled model/API key, validated timeout, bounded output tokens, and strict response parsing.

`/api/ask` validates the question, runs hybrid search with limit four, and branches:

- zero chunks: return fixed `资料中未找到相关内容`, citations `[]`, and do not call the adapter;
- chunks exist: compose numbered evidence containing filename, chunk index, offsets, and text; add server instruction requiring a concise answer and `[n]` citations; call the chat adapter; return answer and citations in that same order.

Client `system`, class, source, and history fields are ignored except for a separately validated bounded user/assistant history input on the compatibility non-streaming route. Provider inputs never include vectors or foreign-class data.

**Alternatives considered:** asking the model to say “I don't know” without evidence was rejected because it can hallucinate; generating deterministic extractive text only was rejected because the assignment specifically asks for AI question answering.

### 5. Store one class prompt and one guided-solving skill

`assistant_configs` is keyed by class and stores system prompt, `guided_solving_enabled`, updater, and version/timestamps. Seed creates a safe default. Teacher-only APIs read/update their authenticated class. Students may retrieve a safe effective summary for UI but update APIs remain server-authorized 403.

For each answer the server composes:

1. saved class role prompt;
2. guided-solving instruction when enabled (give reasoning hints, avoid final answer, cite evidence);
3. numbered same-class evidence;
4. bounded persisted conversation history;
5. current user question.

Changes apply to the next request and do not rewrite prior messages.

### 6. Persist conversations and stream with SSE framing

`conversations` stores owner user/class/title/timestamps. `conversation_messages` stores role, content, status, citations JSON, and timestamps. Object access fetches by ID then compares owner/class, returning identical 404 for foreign/missing.

The streaming POST route authenticates before headers, writes `text/event-stream`, and emits:

- `meta`: conversation and message IDs;
- `citation`: each ordered evidence record;
- `delta`: answer text fragments;
- `done`: final persisted message state;
- `error`: generic bounded failure.

The adapter may consume upstream SSE; tests use deterministic fakes. If the provider only returns one complete result, the service may divide it into bounded deltas for the client contract, but production configuration should use provider streaming when supported. A failed stream leaves an error-status message or no completed assistant message, never a fabricated success.

History is loaded from persisted allowed messages and bounded by both count and total characters. Client-provided system/assistant history is discarded.

### 7. Extend the current browser rather than introduce a second frontend stack

The authenticated UI gains search/answer tabs and a conversation panel styled similarly to the teacher examples. The API wrapper reads the token from sessionStorage and applies Authorization. XHR upload also sets the header. The streaming client uses `fetch` plus `ReadableStream` parsing for SSE.

Teachers see prompt and skill controls; students do not. Both see identity, materials navigation, question input, source cards, conversation selection, theme, command palette, and logout. Citation cards link to the existing class-authorized material detail. Token values are visible only through DevTools/request headers and are never rendered into the page.

### 8. Use deterministic local provider configuration for assignment evidence

Unit/integration tests use fake embedding/chat providers to prove no-call, citation ordering, prompt/skill composition, and streaming events. Compose accepts a real OpenAI-compatible endpoint/key/model for assignment screenshots; a local deterministic mock may verify mechanics but must be labeled as mock evidence and not substituted for the requested AI-answer screenshot when a real course/provider credential is available.

The user explicitly selected the local OpenAI-compatible mock for the submitted lesson-4/5 evidence. The repository therefore labels the evidence as local mock output and does not require or retain a third-party provider credential. A real compatible endpoint remains optional through the documented server-side environment variables.

Screenshot artifacts stay under ignored `evidence/lesson-4-5/` because access tokens are temporary credentials. The repository retains sanitized instructions and request/response transcripts without raw tokens or API keys.

## Risks / Trade-offs

- **[Risk] JWT in browser storage can be stolen by XSS** → Keep short TTL, use sessionStorage, sanitize material/assistant Markdown, enforce CSP-compatible rendering, and retain HttpOnly Cookie as the safer compatibility path.
- **[Risk] Cookie and Bearer identities disagree** → Authorization takes precedence; invalid or mismatched Bearer requests fail closed and do not fall back.
- **[Risk] Chunk reindex leaves mixed generations** → Build replacement generation, switch eligibility atomically, and delete old chunk/vector rows after successful transition.
- **[Risk] Model ignores citation or guided-solving instructions** → Validate citation syntax where possible, display only server-provided citation cards, use strict prompt construction, and test provider input separately from model quality.
- **[Risk] SSE disconnects mid-answer** → Detect abort, stop provider work where possible, record error/incomplete state, and never mark an incomplete assistant message done.
- **[Risk] Real provider unavailable during grading** → Document required variables, startup checks, fixed no-hit path, generic 503 path, and an optional local OpenAI-compatible provider setup.
- **[Risk] Conversation history exceeds context window** → Bound message count/characters and include only persisted user/assistant messages.

## Migration Plan

1. Add validated JWT/chat/chunk/history configuration and dependencies.
2. Add token-session, chunk, chunk-embedding, assistant-config, conversation, and message migrations plus seed defaults.
3. Implement JWT issuance/auth/revocation and migrate browser API wrapper to Bearer while retaining Cookie fallback.
4. Implement chunking/reindex and backfill existing knowledge entries into chunks.
5. Implement explicit search modes and chunk-level source responses.
6. Implement non-streaming grounded ask and no-hit/provider-failure branches.
7. Implement prompt/skill configuration and authorization.
8. Implement persistent conversations, SSE streaming, and browser UI.
9. Run security, class-isolation, provider, stream, persistence, and Compose acceptance; capture local screenshots; update README/evidence.
10. Sync and archive the completed change.

Rollback can disable JWT/browser token use and assistant routes while preserving current Cookie materials/retrieval behavior. Additive tables and chunks may remain for later retry; rollback must not delete original files, materials, knowledge entries, or existing entry embeddings.
