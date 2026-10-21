# Proposal

## Why

The lesson-6 phase acceptance requires CampusClaw to evolve from one configured knowledge assistant into a small AI application platform with multiple applications, reusable prompt templates, knowledge retrieval, installable skills, external tools, MCP integration, and reproducible evidence of the exact provider requests and tool execution flow. The repository already has secure authentication, class-scoped RAG, one prompt and one guided-solving toggle, so this change should extend those foundations rather than introduce a separate product.

## What Changes

- Add class-scoped AI application records so each class can expose multiple named assistants with independent prompt template, knowledge-retrieval, skill, and tool bindings.
- Seed at least two demonstrable AI applications: a class knowledge assistant and a formula tutoring assistant.
- Add reusable prompt templates with bounded variables, preview rendering, versioning, and teacher-only management.
- Replace the single guided-solving toggle as the only skill mechanism with a skill registry that supports built-in skills and teacher-uploaded skill packages.
- Define an uploadable skill package as a bounded UTF-8 Markdown `SKILL.md` file with YAML frontmatter metadata and instruction content; reject executable code, path traversal, duplicate identifiers, and unsupported files.
- Add explicit skill execution stages so a bound skill can contribute instructions, request a server-side action, or transform a bounded result without sending the complete skill package or unrelated skills to the model.
- Add a local MCP server exposing at least two safe tools and an application-side MCP client that discovers tools with `tools/list`, sends only selected tool schemas to the model, validates tool calls, executes them server-side, and returns bounded results for the final answer.
- Add teacher-managed bindings for prompt templates, knowledge retrieval, skills, and MCP tools while preserving student read/use-only permissions and class isolation.
- Add provider-request and tool-call trace records that answer the assignment questions without retaining credentials, full tokens, unrestricted knowledge bases, or unnecessary private content.
- Add an evidence browser/export and a final PDF report that documents the Git repository, project summary, per-request LLM parameters/responses, knowledge selection behavior, skill contribution/execution, and MCP tool parameters/results.
- Preserve JWT/Cookie authentication, same-class RAG, citations, conversations, and SSE behavior from the preceding change.

## Capabilities

### New Capabilities

- `ai-application-management`: Multiple class-scoped AI applications and their prompt, retrieval, skill, and tool bindings.
- `prompt-template-management`: Reusable, versioned prompt templates with bounded variables, preview, and teacher-only editing.
- `skill-package-management`: Built-in skills, uploaded `SKILL.md` packages, validation, binding, and controlled execution.
- `mcp-tool-integration`: MCP server registration, tool discovery, provider tool schemas, validated server-side execution, and final-answer continuation.
- `ai-execution-observability`: Sanitized traces and evidence exports covering model requests, retrieval selection, skill use, tool calls, and model responses.

### Modified Capabilities

- `service-operations`: Compose and documentation must start the MCP runtime, configure safe limits, reproduce lesson-6 acceptance paths, and generate the final PDF report.
- `material-browser-experience`: The authenticated browser gains AI application selection and teacher management views for templates, skills, tool bindings, and execution evidence while preserving existing materials behavior.

## Impact

Affected areas include PostgreSQL migrations and seed data, assistant orchestration, prompt construction, class-scoped repositories, browser pages, multipart upload validation, conversation messages, provider request/response adapters, a new MCP server/client module, tool execution allowlists, audit redaction, Docker Compose services, deterministic mock provider behavior, automated tests, README/evidence documentation, and the PDF submission artifact. No real provider credential, reusable access token, unrestricted skill code, or external arbitrary command execution will be committed.
