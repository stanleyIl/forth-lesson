# Course Foundation Verification

Date: September 23, 2026

## Automated verification

```bash
npm test
npm run build
npx openspec validate complete-course-foundation-experience --strict
```

The suite covers authentication, session revocation, server-side class isolation, teacher/student permissions, upload validation and rollback, protected download, identical cross-class/missing 404 responses, safe Markdown, browser feature markers, retrieval fusion/fallback, logging redaction, migrations, and embedding lifecycle.

## Compose startup and persistence

```bash
source ~/.zshrc
export SESSION_SECRET='replace-with-at-least-32-local-characters'
docker compose up --build --wait
docker compose ps
curl http://127.0.0.1:3000/health
```

Expected: application and database are healthy; health returns `{"status":"ok"}`. PostgreSQL is not published to a host port. Recreating containers without `-v` retains database and material volumes.

## Seed and identity

Run the README seed command twice. SQL verification:

```sql
SELECT account_identifier, role, class_id FROM users ORDER BY account_identifier;
SELECT id, class_id, original_filename FROM materials WHERE id LIKE 'seed-%' ORDER BY id;
```

Expected: `teacher-a`, `student-a`, `teacher-b`, `student-b`; one distinguishable seed material and knowledge entry per class; repeated seed runs do not add duplicates or overwrite uploaded rows.

## Authentication and authorization

- `GET /api/me` returns session-derived user, role and class.
- `POST /api/logout` clears the cookie and revokes the session row; the old cookie subsequently receives 401.
- Student A can list, view, download and search class-A data.
- Student A requesting class-B material/detail/file receives the same `{"error":"Not Found"}` and HTTP 404 as a nonexistent ID.
- A student calling upload directly receives 403 with no file/database changes.
- Unknown-account and wrong-password login responses are identical.

## Upload and browser

- Valid non-empty UTF-8 `.txt` and `.md` uploads create one material plus linked entries.
- Unsupported, empty, invalid-UTF-8 and oversized uploads return 415/400/400/413 and leave no partial file or rows.
- The authenticated page restores identity through `/api/me`; teacher sees upload, student does not.
- List/grid, local same-class filter, light/dark theme, Command/Ctrl+K palette, XHR upload progress, bounded toast messages and logout are present.
- Markdown headings/lists/code render, while script tags and `javascript:` links are removed.

## Database-native retrieval

Schema checks:

```sql
SELECT extversion FROM pg_extension WHERE extname='vector';
SELECT status, embedding IS NOT NULL, count(*)
FROM knowledge_entry_embeddings
GROUP BY status, embedding IS NOT NULL;
```

Expected: pgvector is enabled; every ready row has a non-null pgvector value.

Lexical SQL uses `search_vector @@ websearch_to_tsquery(...)` and `ts_rank_cd` with the trusted class predicate and bounded limit. Vector SQL uses the trusted class/model/status predicates and `embedding <=> $query::vector`, then bounded results enter deterministic RRF. On the small classroom fixture PostgreSQL may prefer a sequential scan for full text; the GIN index remains present and the query is database-native. The vector plan uses the class/model/status index before distance ordering.

A credential-free local mock provider was used for acceptance. Backfill produced ready pgvector rows, and hybrid API output contained both `lexicalRank` and `vectorRank` with source metadata. Stopping the provider produced `lexical_fallback` without cross-class leakage or fabricated sources.

## Secret and data audit

Repository and captured-log tests verify that passwords, password hashes, cookies, session tokens, provider credentials, vectors, complete queries/content, SQL details, storage keys, and absolute paths are not returned or logged. `.env` and local evidence are ignored; `.env.example` contains placeholders only.

## Scope review

No registration, administrator, JWT/OAuth/SSO, LLM-generated answer, assistant conversation, assignment workflow, skill, MCP, Kubernetes, or multi-replica behavior is introduced by this change.

## Delta scenario evidence map

| Capability | Scenarios | Evidence |
| --- | --- | --- |
| account-authentication | Current user returned/requires auth; logout invalidates/idempotent; unknown account equivalent path | `tests/auth-and-authorization.test.ts`, login failure parameterized tests, session repository test, Compose curl logout/old-cookie check |
| material-ingestion | Same-class teacher/student seed; distinguishable class B; repeatable seed; same-class download; missing file generic | `tests/seed-and-repositories.test.ts`, `tests/material-download.test.ts`, two-run Compose seed SQL |
| role-and-class-authorization | Student same-class view/download; upload forbidden; material/file/entry foreign IDs match missing 404 | `tests/material-download.test.ts`, `tests/material-ingestion.test.ts`, `tests/auth-and-authorization.test.ts`, Compose foreign/missing curl output |
| material-browser-experience | Teacher/student actions; logout; list/grid/filter; safe Markdown; download; theme; palette; upload progress; bounded failures | `tests/browser-experience.test.ts`, authenticated page tests, direct API authorization tests |
| class-scoped-knowledge-retrieval | Both channels; deduplication; deterministic rank; ready-only; pgvector persistence; native plans | `tests/retrieval.test.ts`, `tests/search-api.test.ts`, migration tests, Compose backfill/hybrid output and PostgreSQL EXPLAIN |
| service-operations | Third-party startup; documented status codes; reproducible principal paths | README startup contract, `.env.example`, healthy Compose output, this verification document |
