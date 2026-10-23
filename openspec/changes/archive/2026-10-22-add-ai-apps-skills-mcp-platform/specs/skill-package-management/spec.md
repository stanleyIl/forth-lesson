# Spec Delta

## Purpose

Defines safe built-in and uploaded assistant skills, including validation, class ownership, application binding, model-context contribution, and controlled server-side execution.

## ADDED Requirements

### Requirement: System provides built-in skills
The system SHALL expose a registry of built-in skills with stable identifiers, descriptions, versions, instruction summaries, and execution type. Teachers may bind enabled built-in skills to applications; students may use but SHALL NOT modify them.

#### Scenario: Built-in skill is bound
- **WHEN** a teacher binds the guided-solving skill to an application
- **THEN** subsequent responses for that application apply the current guided-solving skill version

#### Scenario: Unbound skill is absent
- **WHEN** an application has no binding to a skill
- **THEN** that skill's instructions and execution behavior are absent from the model request and server pipeline

### Requirement: Teachers can upload skill packages
The system SHALL accept a bounded UTF-8 Markdown `SKILL.md` upload containing YAML frontmatter metadata and instruction content. The server SHALL validate identifier, name, version, execution type, size, encoding, duplicate state, and forbidden content before storing the skill in the teacher's class.

#### Scenario: Valid skill package is uploaded
- **WHEN** a teacher uploads a valid `SKILL.md`
- **THEN** the skill becomes available for binding within the teacher's class

#### Scenario: Student upload is forbidden
- **WHEN** a student directly calls the skill upload operation
- **THEN** the server returns HTTP 403 and stores nothing

#### Scenario: Unsafe package is rejected
- **WHEN** an upload contains executable code, path traversal, an unsupported filename, invalid frontmatter, oversized content, or a duplicate immutable version
- **THEN** the server returns a bounded validation error and stores nothing

### Requirement: Skill context is minimal and explicit
For each model request, the system SHALL include only the instruction content required by skills bound to the selected application. It SHALL NOT send unrelated skills, uploaded file bytes, storage paths, or complete skill registries.

#### Scenario: Trace identifies sent skill content
- **WHEN** an authorized teacher inspects a sanitized execution trace
- **THEN** the trace identifies each bound skill/version and the bounded instruction or schema contribution sent to the model

### Requirement: Skill execution is server-controlled
Skills declaring a server execution type SHALL map to an allowlisted implementation with validated input and bounded output. Uploaded skills SHALL NOT introduce arbitrary JavaScript, shell commands, filesystem access, network destinations, or dynamic module loading.

#### Scenario: Deterministic skill executes
- **WHEN** the model or orchestration pipeline selects an allowed deterministic skill action
- **THEN** the server validates its arguments, executes the registered implementation, records the result, and uses the bounded result in the answer

#### Scenario: Unknown action is rejected
- **WHEN** a skill or model requests an unregistered action
- **THEN** the server rejects execution and returns a generic bounded failure

