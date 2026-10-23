# Spec Delta

## Purpose

Defines sanitized execution traces and exports that make prompt, retrieval, skill, model, and MCP behavior verifiable without exposing credentials or unrestricted private data.

## ADDED Requirements

### Requirement: Each assistant run has a structured trace
The system SHALL assign an execution identifier to each assistant run and record its application, user/class scope, prompt template version, bounded model parameters, selected knowledge evidence, bound skill versions, advertised tool schemas, model tool calls, tool results, final response metadata, status, and timestamps.

#### Scenario: Successful run is traceable
- **WHEN** an assistant run completes with retrieval and a tool call
- **THEN** its trace links the model request, selected evidence, skill contributions, tool arguments/result, and final response in execution order

#### Scenario: No-hit run proves model skip
- **WHEN** an application requiring knowledge grounding has no eligible evidence
- **THEN** the trace records no-hit and confirms that no model or tool call occurred

### Requirement: Trace access is authorized and sanitized
Only a teacher SHALL be able to inspect detailed traces for the teacher's class. Trace responses and logs MUST omit passwords, JWTs, Cookie values, provider credentials, MCP credentials, unrestricted knowledge corpora, storage paths, and raw database details.

#### Scenario: Teacher views class trace
- **WHEN** a class-A teacher requests a class-A execution trace
- **THEN** the server returns the sanitized trace

#### Scenario: Student trace access is forbidden
- **WHEN** a student requests detailed execution traces
- **THEN** the server returns HTTP 403

#### Scenario: Cross-class trace is hidden
- **WHEN** a class-A teacher requests a class-B trace identifier
- **THEN** the server returns the same HTTP 404 response used for a nonexistent trace

### Requirement: Evidence export answers phase acceptance questions
The system SHALL provide a reproducible evidence export that states the model request parameters and response, whether the rendered prompt template was sent, which knowledge chunks were selected instead of the full knowledge base, which skill instructions or actions participated, how a skill executed, and which MCP tool schema, arguments, and result participated.

#### Scenario: Teacher exports acceptance evidence
- **WHEN** a teacher exports evidence for representative seeded runs
- **THEN** the export contains sufficient sanitized information to answer all five verification questions in the phase assignment

