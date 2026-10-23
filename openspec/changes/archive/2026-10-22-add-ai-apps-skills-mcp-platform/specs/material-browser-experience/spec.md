# Spec Delta

## ADDED Requirements

### Requirement: Browser exposes an AI application workspace
The authenticated browser SHALL allow users to select an enabled same-class AI application, create or continue an application-specific conversation, and view knowledge citations, skill activity, tool activity, streaming answer state, and bounded errors.

#### Scenario: User switches applications
- **WHEN** an authenticated user selects another enabled application
- **THEN** subsequent conversations use that application's server-controlled configuration

#### Scenario: Tool activity is visible
- **WHEN** an answer executes a skill action or MCP tool
- **THEN** the conversation shows a bounded status and result summary without exposing credentials or internal transport details

### Requirement: Teachers have management views
Teachers SHALL have browser controls for AI applications, prompt templates, skill upload and binding, MCP tool binding, and sanitized execution evidence. Students SHALL NOT see mutation controls, and direct student mutation calls SHALL remain forbidden by the server.

#### Scenario: Teacher manages lesson-six resources
- **WHEN** a teacher opens the management workspace
- **THEN** the browser shows same-class applications, templates, skills, discovered tools, bindings, and evidence

#### Scenario: Student sees use-only experience
- **WHEN** a student opens the application workspace
- **THEN** the browser shows enabled applications and conversations but no management or evidence controls

### Requirement: Skill upload has safe feedback
The teacher skill upload experience SHALL accept one `SKILL.md`, show validation status and upload progress, and display bounded errors for unsupported, invalid, duplicate, or oversized packages.

#### Scenario: Valid skill upload completes
- **WHEN** a teacher uploads a valid skill package
- **THEN** the browser reports success and refreshes the same-class skill registry

#### Scenario: Invalid skill upload is explained
- **WHEN** the server rejects a skill package
- **THEN** the browser displays a bounded validation message without showing storage paths, stack traces, or foreign skill metadata

