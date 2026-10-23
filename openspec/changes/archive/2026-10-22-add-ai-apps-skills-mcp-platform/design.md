# Design

## Context

CampusClaw currently has Fastify/TypeScript, PostgreSQL/pgvector, JWT and Cookie authentication, class-scoped material ingestion, chunk retrieval, grounded answers, one class prompt, one guided-solving toggle, persistent conversations, SSE, and a local OpenAI-compatible mock provider. Those changes are still represented by the in-progress `add-jwt-rag-streaming-assistant` change, so this lesson-six change depends on that implementation and must be applied after its code and specs are synchronized.

The phase acceptance requires observable answers to five questions: the exact model parameters/response and prompt participation; whether retrieval sends the whole knowledge base; whether skill binding sends the whole skill; how skill execution works; and what model parameters are sent when MCP is integrated. The implementation therefore needs structured execution records rather than relying only on screenshots or application logs.

## Goals / Non-Goals

**Goals:**

- Turn the existing assistant into a class-scoped multi-application platform without weakening authentication or class isolation.
- Make prompt, retrieval, skill, and MCP participation explicit and reproducible.
- Support safe teacher-uploaded declarative skills without arbitrary code execution.
- Implement a real MCP protocol boundary with at least two deterministic local tools.
- Preserve the existing grounded no-hit behavior, citations, persistent conversations, and SSE contract.
- Generate deterministic local acceptance evidence and a PDF without real provider credentials.

**Non-Goals:**

- A public skill marketplace, arbitrary plugin runtime, package manager, or remote code execution.
- Letting uploaded skills run JavaScript, shell commands, SQL, arbitrary filesystem operations, or arbitrary outbound HTTP.
- General-purpose MCP server administration, OAuth delegation, multi-tenant organizations, billing, or production secrets management.
- Unlimited autonomous tool loops, background agents, queues, multi-replica coordination, or destructive tools.
- Sending entire knowledge bases, complete skill registries, private traces, provider keys, or reusable tokens to a model.

## Decisions

### 1. Finish and sync the preceding assistant change before applying this change

The repository has one unarchived change containing the JWT, chunk, grounded-answer, assistant-config, and conversation capabilities on which lesson six depends. Apply will first close its remaining non-provider work, synchronize its delta specs into main specs, and archive it before modifying shared code for this change.

This avoids maintaining two active changes that both redefine assistant configuration and browser behavior. It also gives this change a stable baseline for tests and future archive operations.

### 2. Model an AI application as bindings, not copied prompt content

New tables will represent:

- `ai_applications`: id, class, name, description, enabled, retrieval policy, current prompt-template version, timestamps.
- `prompt_templates` and immutable `prompt_template_versions`.
- `skills` and immutable `skill_versions`, with origin `builtin` or `uploaded`.
- `ai_application_skill_bindings`.
- `mcp_servers`, discovered `mcp_tools`, and `ai_application_tool_bindings`.
- a conversation foreign key to `ai_application_id`.

Applications reference versions rather than copying full definitions. Existing class prompt and guided-solving state migrate into a default `class-knowledge-assistant` application, one prompt template, and the built-in `guided-solving` skill. A second seeded `formula-tutor` application demonstrates multiple applications and tool use.

Alternative considered: store one JSON configuration document per application. Rejected because relational ownership, version references, uniqueness, auditing, and cross-class foreign-key validation are clearer with explicit tables.

### 3. Prompt templates use a small server-rendered variable language

Template syntax will use `{{variable_name}}` placeholders. Allowed variables are declared per template from a fixed server allowlist:

- `application_name`
- `user_role`
- `question`
- `current_date`
- `knowledge_evidence`
- `skill_instructions`
- `conversation_summary`

The server validates placeholders on create/update and renders them from trusted runtime values. `knowledge_evidence` and `skill_instructions` are assembled server-side and cannot be replaced by client fields. Preview uses supplied representative values but never calls the provider.

Alternative considered: a general template engine with conditionals and helpers. Rejected because lesson acceptance needs transparent prompt composition, not executable template logic.

### 4. Uploaded skills are declarative `SKILL.md` files

The accepted package is exactly one UTF-8 file named `SKILL.md`, bounded by configuration. YAML frontmatter contains:

```yaml
id: summarize-evidence
name: 证据摘要
version: 1.0.0
type: instruction
description: 将检索证据整理为简洁要点
```

The Markdown body is the bounded instruction content. Supported types are:

- `instruction`: contributes selected instruction text to the model.
- `server_action`: references one implementation from a fixed server action registry, such as `format-citations` or `extract-key-points`.

Uploaded files cannot contain executable code or create new server actions. A `server_action` package may only select a pre-registered action and provide bounded declarative options validated against that action's schema.

Alternative considered: ZIP packages or npm-style directories. Rejected because they add traversal, dependency, executable-content, and review risk beyond the assignment.

### 5. Send only bound skill contributions

The orchestration service loads only skills bound to the selected application and active version. For `instruction` skills it adds the bounded Markdown body to the rendered system context. For `server_action` skills it advertises or executes only the registered action schema. It never sends the `SKILL.md` frontmatter bytes, storage path, unrelated skills, or entire registry.

The execution trace records skill id/version, contribution type, a hash, a bounded preview, validated arguments, status, and bounded result. This directly answers whether a whole skill is sent and how it executes.

### 6. Use the maintained MCP TypeScript SDK and Streamable HTTP locally

A new Node service under the repository will use the maintained Model Context Protocol TypeScript SDK and expose Streamable HTTP on the internal Compose network. It will implement at least:

- `calculate`: bounded arithmetic expression or explicit numeric operation.
- `lookup_class_schedule`: deterministic lookup from a small seeded schedule.

The application acts as an MCP client. At startup and on controlled refresh it initializes each configured server, calls `tools/list`, validates returned names/descriptions/schemas, and persists a sanitized discovery snapshot. No MCP port is exposed publicly by default.

Alternative considered: implement only an internal function registry and label it MCP. Rejected because the course specifically requires understanding protocol roles, discovery, and tool execution boundaries.

### 7. Normalize model tool names and keep bindings server-side

Provider tool names use `mcp__<server-slug>__<tool-name>` after strict normalization and collision checks. Each normalized name maps to one persisted server/tool identity. The browser submits only the application and question; it cannot submit arbitrary tool schemas or MCP destinations.

The model request contains:

- configured model and bounded generation parameters;
- rendered prompt template;
- bounded persisted conversation history;
- selected class knowledge evidence;
- selected skill instructions/actions;
- only tool schemas bound to the selected application.

The full knowledge base, unbound skills, unbound MCP tools, credentials, and internal URLs are absent.

### 8. Extend the chat provider to support tool-call rounds

The current provider returns only one text string. It will be changed to return a structured result containing assistant content, finish reason, and zero or more tool calls. The orchestration loop is:

1. Compose trusted model messages and bound tool schemas.
2. Call the provider and record a sanitized request/response step.
3. If no tool call exists, finalize the answer.
4. For each returned call, verify the normalized name is bound, validate JSON arguments, and enforce time/count/output limits.
5. Execute the MCP tool or registered skill action.
6. Append an assistant tool-call message and tool result message.
7. Call the provider again for the final user-facing answer.

Tool rounds and total calls are capped by configuration, initially one round and two calls. Parallel tool calls may be executed sequentially for deterministic evidence. A failure produces a bounded error state and never fabricates a successful result.

### 9. Keep RAG evidence selective

Applications may enable or disable knowledge retrieval and choose the existing keyword, vector, or hybrid policy with bounded top-k. When enabled, the server retrieves eligible same-class chunks and sends only selected excerpts with source identifiers. It never serializes the full class corpus into the provider request.

An application may require evidence. For required-evidence applications, no-hit returns the existing fixed response without model or tool calls. For non-required applications, such as a calculator demonstration, the server may call the model and bound tools without knowledge evidence.

### 10. Persist structured execution traces separately from logs

New `ai_executions` and `ai_execution_steps` tables will record:

- user, class, application, conversation, and message identifiers;
- template/skill/tool versions and retrieval mode;
- model endpoint identity and model name, but no credential;
- bounded generation parameters;
- evidence identifiers, ranks, offsets, hashes, and bounded excerpts;
- sanitized message-role summaries and character counts;
- model response text or bounded preview as required for teacher evidence;
- tool schema names, validated arguments, status, latency, and bounded result;
- final status and timestamps.

Application logs remain metadata-only. Detailed traces are accessible only to same-class teachers. Retention is bounded by configurable days and per-class count; cleanup is explicit.

### 11. Browser extends the current server-rendered application

The current page will gain:

- AI application cards or selector.
- Application-specific conversation creation.
- Teacher tabs for application, template, skill, MCP binding, and evidence management.
- `SKILL.md` upload progress and validation feedback.
- visible retrieval citations and bounded skill/tool activity on assistant messages.
- evidence detail and JSON export for a selected execution.

The browser continues to use Bearer requests from sessionStorage with Cookie compatibility. It never renders provider keys, MCP credentials, full tokens, storage paths, or unrestricted prompt/history payloads.

### 12. Deterministic mock provider supports tool calls

The local mock provider will inspect the request and deterministically return:

- a normal grounded response when no tool is needed;
- a `calculate` tool call for a configured arithmetic question;
- a `lookup_class_schedule` tool call for a configured schedule question;
- a final answer after receiving the tool result.

This makes Compose acceptance and PDF evidence reproducible without a paid provider. Evidence will clearly label the provider as local mock.

### 13. Generate the PDF from trace exports and repository metadata

A repository script will read sanitized representative evidence JSON, the repository URL, test summaries, and documented project description, then generate a plain-text PDF. The report will answer the five assignment questions directly and identify mock-provider limitations. Screenshot files remain ignored; sanitized JSON and the generated final PDF may be versioned.

## Risks / Trade-offs

- **[Risk] Uploaded skill text contains prompt injection** → Only teachers upload; content is bounded, visible before binding, isolated to bound applications, and cannot grant tools or override server security instructions.
- **[Risk] Declarative skills are less flexible than executable plugins** → The assignment is satisfied through instruction skills and a small registered server-action set without arbitrary code risk.
- **[Risk] Model requests sensitive context** → Server composition uses allowlisted fields, selected chunk excerpts, bounded history, and redacted traces; provider credentials remain outside request evidence.
- **[Risk] MCP server or tool hangs** → Apply connection, call, output, and total-round timeouts; abort and return a generic bounded failure.
- **[Risk] Model hallucinates tool names or arguments** → Require current application binding and JSON-schema validation before any execution.
- **[Risk] Tool results manipulate the model** → Mark results as tool content, bound size, preserve source metadata, and keep final system instructions authoritative.
- **[Risk] Trace storage contains private questions or answers** → Restrict trace access to same-class teachers, bound previews/retention, and redact credentials and identity tokens.
- **[Risk] Two active OpenSpec changes conflict** → Finish, sync, and archive the preceding assistant change before applying this one.

## Migration Plan

1. Complete and archive `add-jwt-rag-streaming-assistant`, preserving current database volumes and tests.
2. Add validated AI-application, template, skill, MCP, tool-loop, trace, and retention configuration.
3. Add new relational tables and migrate the current class prompt/guided-solving configuration into the default application/template/skill records.
4. Add seeded applications, templates, built-in skills, schedule data, and default bindings.
5. Implement prompt rendering and application orchestration while keeping existing `/api/ask` behavior available through the default application.
6. Implement skill upload/validation and registered skill actions.
7. Add the local MCP server, application MCP client, discovery, binding, and tool execution loop.
8. Add execution tracing, teacher evidence APIs, browser management views, and deterministic mock provider tool calls.
9. Add Compose services, migration/seed/restart/outage verification, security tests, and report generation.
10. Generate representative sanitized evidence and the final PDF, then validate, sync, archive, commit, and push.

Rollback disables lesson-six routes and bindings while leaving existing materials, knowledge entries, chunks, conversations, and the default assistant available. Additive tables may remain for later recovery; rollback does not delete uploaded materials or prior conversations.
