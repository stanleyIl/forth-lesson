# Tasks

## 1. Baseline and Change Sequencing

- [x] 1.1 Audit the in-progress `add-jwt-rag-streaming-assistant` implementation against its remaining tasks and verify no lesson-six code is added before the baseline is stable
- [x] 1.2 Complete or explicitly resolve the preceding change's remaining security, evidence, documentation, and test tasks; verify its full test/build/strict-validation suite passes
- [x] 1.3 Sync and archive the preceding change so its assistant, conversation, and configuration capabilities exist in main specs; verify only `add-ai-apps-skills-mcp-platform` remains active
- [x] 1.4 Capture the clean baseline test count, Compose behavior, and database migration set; verify lesson-six regression comparisons can reference it

## 2. Configuration, Dependencies, and Module Boundaries

- [x] 2.1 Add validated limits for application/template/skill counts, skill upload size, MCP connection/call timeout, tool rounds/calls/output, and execution-trace retention; verify unsafe bounds fail startup
- [x] 2.2 Add the maintained MCP TypeScript SDK and YAML/frontmatter parsing dependencies without adding browser-side MCP credentials; verify lockfile audit and TypeScript build pass
- [x] 2.3 Extend logger redaction for application prompts, skill bodies, tool arguments/results, provider messages, MCP credentials, execution trace payloads, tokens, and cookies; verify logs retain operation metadata only
- [x] 2.4 Define modules for AI applications, prompt templates, skill packages/actions, MCP server/client, orchestration, execution traces, evidence export, and report generation; verify existing baseline tests still pass

## 3. Database Schema and Migration

- [x] 3.1 Add a versioned migration for `prompt_templates` and immutable `prompt_template_versions` with class ownership, enabled state, variables, versioning, and audit fields; verify migration on existing data
- [x] 3.2 Add `ai_applications` with class ownership, prompt version, retrieval policy, evidence requirement, enabled state, and timestamps; verify class-scoped uniqueness and constraints
- [x] 3.3 Add `skills`, immutable `skill_versions`, origin/type/action metadata, bounded content, class ownership, and enabled state; verify built-in and uploaded variants
- [x] 3.4 Add application-skill binding tables with class-safe foreign keys and deterministic ordering; verify foreign-class bindings fail
- [x] 3.5 Add `mcp_servers`, discovered `mcp_tools`, discovery status/version/hash, and application-tool binding tables; verify normalized tool-name collision constraints
- [x] 3.6 Add `ai_executions` and ordered `ai_execution_steps` with class/user/application/conversation scope, sanitized JSON fields, status, latency, and timestamps; verify cross-class relations are impossible
- [x] 3.7 Associate conversations with an AI application while preserving existing conversations through a default-application migration; verify existing messages remain readable
- [x] 3.8 Migrate existing assistant prompt and guided-solving state into a default prompt template, class knowledge application, built-in skill version, and binding; verify idempotent migration/backfill

## 4. Seeded Applications and Prompt Templates

- [x] 4.1 Seed a class knowledge assistant and formula tutoring assistant for classes A and B with distinguishable class-scoped records; verify repeated seed runs do not duplicate versions or bindings
- [x] 4.2 Implement prompt-template repository create/list/get/version/update/disable operations with teacher class scope; verify cross-class and student mutations fail
- [x] 4.3 Implement strict `{{variable_name}}` parsing against the server allowlist; verify undeclared, missing, malformed, and oversized placeholders are rejected
- [x] 4.4 Implement server-side template preview and rendering with trusted values and no provider call; verify escaping and deterministic output
- [x] 4.5 Implement application repository create/list/get/update and binding validation; verify only enabled same-class applications are usable
- [x] 4.6 Add application/template APIs and validation while ignoring client identity, model, prompt, class, skill, and tool overrides; verify 400/403/404 behavior

## 5. Skill Registry, Upload, and Execution

- [x] 5.1 Implement built-in skill registration with immutable versions and migrate guided-solving into the registry; verify binding changes provider instructions
- [x] 5.2 Define and document the accepted `SKILL.md` YAML frontmatter schema for `instruction` and `server_action` skills; verify representative valid examples parse
- [x] 5.3 Implement bounded UTF-8 `SKILL.md` validation for filename, size, identifier, semantic version, duplicate state, frontmatter, Markdown body, and forbidden executable/path content; verify adversarial uploads fail atomically
- [x] 5.4 Implement teacher-only skill upload storage and database commit with cleanup on failure; verify students receive 403 and no partial records/files remain
- [x] 5.5 Implement skill list/detail/version/disable APIs and same-class application binding APIs; verify foreign skills are hidden and direct binding escalation fails
- [x] 5.6 Implement minimal instruction-skill composition so only bound skill bodies and version metadata participate; verify unrelated skill content is absent from provider requests
- [x] 5.7 Implement an allowlisted registered server-action interface with bounded inputs/outputs and at least two deterministic actions; verify uploaded packages cannot create arbitrary implementations
- [x] 5.8 Implement skill execution records and failure behavior; verify unknown action, invalid arguments, timeout, and oversized result do not fabricate success

## 6. Local MCP Server and Client

- [x] 6.1 Add a separate local MCP server entrypoint using the maintained SDK and Streamable HTTP transport; verify initialize and protocol negotiation succeed
- [x] 6.2 Implement a bounded deterministic `calculate` MCP tool and unit tests for valid operations, invalid expressions, finite numbers, and output limits
- [x] 6.3 Implement a class-schedule lookup MCP tool backed by seeded non-sensitive schedule data; verify valid lookup, no match, and invalid input behavior
- [x] 6.4 Add MCP server health/liveness behavior and generic protocol errors without stack traces or credentials; verify malformed JSON-RPC and unsupported methods are bounded
- [x] 6.5 Implement application-side MCP registration and client lifecycle from server-controlled configuration; verify credentials and internal endpoints never reach browser responses
- [x] 6.6 Implement `tools/list` discovery, schema validation, sanitized persistence, refresh, stale/error state, and normalized `mcp__server__tool` names; verify collision handling
- [x] 6.7 Implement application-tool bindings restricted to discovered same-class/public tools; verify unbound and unknown tools cannot be advertised or executed
- [x] 6.8 Implement validated `tools/call` execution with connection/call timeout, argument schema, output limit, cancellation, and generic failure mapping; verify outage recovery

## 7. Provider Tool Calls and Application Orchestration

- [x] 7.1 Refactor the chat provider contract to support assistant content, finish reason, tool calls, tool messages, and tool schemas while preserving non-tool responses; verify provider compatibility tests
- [x] 7.2 Update the local mock provider to produce deterministic normal answers, calculator calls, schedule calls, and final answers after tool results; verify no real credentials are needed
- [x] 7.3 Implement application execution context loading for current template version, retrieval policy, bound skills, bound MCP tools, and bounded persisted conversation history; verify client overrides are absent
- [x] 7.4 Implement selective same-class retrieval according to application mode/top-k and required-evidence behavior; verify only selected chunks, not the full knowledge base, reach provider input
- [x] 7.5 Implement trusted prompt rendering that combines template, selected evidence, bound skill instructions, history, current question, and server security instructions; verify all required contributions and ordering
- [x] 7.6 Implement the capped model/tool loop: initial model request, bound-call validation, skill/MCP execution, tool result append, and final model request; verify one-round/two-call limits
- [x] 7.7 Reject hallucinated, unbound, malformed, repeated, or oversized tool calls; verify no server action or MCP call occurs after denial
- [x] 7.8 Preserve no-hit model skip for required-evidence applications and allow non-retrieval tool applications to proceed; verify traces distinguish both paths
- [x] 7.9 Integrate application orchestration into persisted conversations and SSE with meta/retrieval/skill/tool/citation/delta/done/error events; verify message status consistency
- [x] 7.10 Add concurrent and cancellation tests proving one user/application execution cannot write into another user's conversation or continue tools after abort

## 8. Execution Traces and Assignment Evidence

- [x] 8.1 Implement execution creation/finalization and ordered step persistence for prompt, retrieval, provider request/response, skill action, MCP call/result, and final answer; verify transactional ordering
- [x] 8.2 Store bounded generation parameters, role summaries, hashes, selected evidence metadata, skill/version metadata, tool schemas/arguments/results, latency, and status without secrets; verify redaction tests
- [x] 8.3 Implement teacher-only same-class trace list/detail APIs with student 403 and cross-class 404; verify raw database/provider/MCP details are absent
- [x] 8.4 Implement sanitized JSON evidence export for selected executions and repository metadata; verify it directly answers all five phase-acceptance questions
- [x] 8.5 Implement trace retention cleanup by age and per-class count without deleting conversations or materials; verify deterministic cleanup behavior
- [x] 8.6 Add explicit evidence proving prompt templates are included, only selected knowledge chunks are included, only bound skill contributions are included, skill execution logic is recorded, and MCP parameters/results are recorded

## 9. Browser AI Application Platform

- [x] 9.1 Add an AI application selector/cards and application-specific conversation creation while preserving materials, theme, command palette, logout, and responsive behavior; verify class scope and selection persistence
- [x] 9.2 Render bounded retrieval, skill, and tool activity on the correct assistant message during SSE; verify safe text rendering and event association
- [x] 9.3 Add teacher application management for name, description, enabled state, template, retrieval policy, evidence requirement, skills, and tools; verify student UI and direct API remain read-only
- [x] 9.4 Add prompt-template list/create/preview/version/update/disable UI with declared-variable feedback; verify preview causes no provider request
- [x] 9.5 Add built-in/uploaded skill registry, one-file `SKILL.md` upload progress, validation errors, versions, disable, and binding UI; verify unsupported files never appear as installed
- [x] 9.6 Add MCP server/tool discovery status and application binding UI without exposing credentials or internal URLs; verify refresh and outage messages
- [x] 9.7 Add teacher execution-evidence list/detail/export UI showing sanitized request parameters, selected chunks, skill contribution/execution, MCP arguments/results, and final response
- [x] 9.8 Add browser tests for multiple applications, template preview, token headers, upload authorization, tool events, trace permissions, XSS-safe content, 401 cleanup, and absence of secrets

## 10. Compose, Documentation, and PDF Report

- [x] 10.1 Add MCP service and lesson-six configuration to `.env.example`, Compose, Dockerfiles, and health checks without real credentials; verify full stack starts from documented values
- [x] 10.2 Update README with multiple applications, template variables, retrieval policy, `SKILL.md` format, built-in/server-action behavior, MCP architecture, tool loop, traces, and security boundaries
- [x] 10.3 Add a lesson-six verification document mapping every assignment feature and question to automated tests, Compose commands, browser steps, and evidence records
- [x] 10.4 Run Compose migration, seed, application switching, template preview, retrieval selection, built-in skill, uploaded skill, MCP discovery, two tool calls, SSE, restart, and MCP outage checks; retain sanitized evidence
- [x] 10.5 Add a repeatable report generator that reads sanitized evidence and repository metadata and outputs a plain-text black-font PDF; verify no token, Cookie, key, credential, or unrestricted content appears
- [x] 10.6 Generate the final PDF containing repository address, project summary, feature verification, and direct answers to the five assignment questions; render every page and verify readable layout
- [x] 10.7 Keep screenshot evidence under ignored `evidence/lesson-6/` and sanitized JSON/PDF under documented versioned paths; verify Git ignore and repository contents

## 11. Security, Full Verification, and Delivery

- [x] 11.1 Add teacher/student/class permission matrix tests across applications, templates, skills, upload, bindings, tools, traces, conversations, and streams
- [x] 11.2 Add adversarial tests for forged class/application/template/skill/tool IDs, prompt injection fields, malicious frontmatter, traversal, executable content, schema bombs, hallucinated tools, and Cookie/Bearer conflicts
- [x] 11.3 Add provider/MCP failure tests for discovery outage, call timeout, invalid JSON, invalid schema, oversized output, repeated calls, partial stream failure, and restart recovery
- [x] 11.4 Audit logs, responses, browser storage, database traces, exports, screenshots, PDF, and committed files for passwords, JWTs, Cookies, provider keys, MCP credentials, internal URLs, foreign content, and raw storage paths
- [x] 11.5 Map every scenario in all seven delta specs to automated or documented Compose evidence and verify each has an explicit passing reference
- [x] 11.6 Run complete build, unit, integration, migration, browser, security, MCP, provider-tool, persistence, Compose, evidence-export, and PDF checks; retain summarized output
- [x] 11.7 Run `npx openspec validate add-ai-apps-skills-mcp-platform --strict` and verify zero errors
- [x] 11.8 Review non-goals and verify no arbitrary code execution, plugin marketplace, arbitrary outbound tool access, OAuth, autonomous background agents, queue, or multi-replica behavior was introduced
- [x] 11.9 Sync and archive the completed change, commit and push the public repository, and confirm the submitted repository address and final commit hash
