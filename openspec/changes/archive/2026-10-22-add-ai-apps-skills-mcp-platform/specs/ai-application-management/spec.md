# Spec Delta

## Purpose

Defines multiple class-scoped AI applications whose prompt, retrieval, skill, and tool bindings are selected by teachers and enforced by the server for every conversation.

## ADDED Requirements

### Requirement: Each class can expose multiple AI applications
The system SHALL allow authenticated users to list and use multiple enabled AI applications belonging to their trusted class. Each application SHALL have a stable identifier, name, description, enabled state, and class ownership.

#### Scenario: Class user lists available applications
- **WHEN** an authenticated class-A user opens the AI application selector
- **THEN** the server returns only enabled class-A applications

#### Scenario: Cross-class application is hidden
- **WHEN** a class-A user requests a class-B application identifier
- **THEN** the server returns the same HTTP 404 response used for a nonexistent application

#### Scenario: Seed provides multiple applications
- **WHEN** the documented seed operation completes
- **THEN** class A has at least a knowledge assistant and a formula tutoring assistant available for acceptance testing

### Requirement: Teachers manage application bindings
An authenticated teacher SHALL be able to create and update applications in the teacher's class and bind one prompt template, optional class knowledge retrieval, zero or more enabled skills, and zero or more allowed MCP tools. Students SHALL be able to read effective application descriptions and use enabled applications but SHALL NOT change bindings.

#### Scenario: Teacher configures an application
- **WHEN** a class-A teacher saves valid prompt, retrieval, skill, and tool bindings
- **THEN** subsequent class-A conversations using that application apply the saved bindings

#### Scenario: Student update is forbidden
- **WHEN** a student directly calls an application create or update operation
- **THEN** the server returns HTTP 403 and no application changes

#### Scenario: Foreign binding identifiers are rejected
- **WHEN** a class-A teacher supplies a class-B template, skill, or private tool binding
- **THEN** the server rejects the operation without revealing foreign object details

### Requirement: Conversation execution is application-specific
Each conversation SHALL be associated with one allowed AI application. Every generated response SHALL use the current server-side application configuration and SHALL NOT accept client overrides for prompt, class, skills, tools, provider model, or knowledge sources.

#### Scenario: Conversation uses selected application
- **WHEN** a user starts a conversation with the formula tutoring application
- **THEN** the server executes that application's prompt, retrieval, skill, and tool policy

#### Scenario: Client configuration override is ignored
- **WHEN** a user includes forged prompt, skill, tool, model, or application configuration in a message request
- **THEN** the server uses only the saved allowed application configuration

