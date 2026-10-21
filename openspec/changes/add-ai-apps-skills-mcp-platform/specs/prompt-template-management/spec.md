# Spec Delta

## Purpose

Defines reusable class-scoped prompt templates with bounded variables and versioned teacher management so model instructions are explicit, inspectable, and reproducible.

## ADDED Requirements

### Requirement: Teachers manage reusable prompt templates
The system SHALL allow teachers to create, list, preview, update, and disable prompt templates in their trusted class. Students SHALL be able to use templates through enabled applications but SHALL NOT modify them.

#### Scenario: Teacher creates template
- **WHEN** a teacher submits a valid name, template body, and allowed variable definitions
- **THEN** the server creates a new versioned template in the teacher's class

#### Scenario: Student template update is forbidden
- **WHEN** a student directly calls a template mutation operation
- **THEN** the server returns HTTP 403 and the template remains unchanged

### Requirement: Template variables are bounded and server-rendered
Template variables SHALL be declared from an allowlist and rendered by the server using trusted values such as current user role, application name, current question, selected evidence summary, and current date. Missing required variables or undeclared placeholders SHALL cause validation failure.

#### Scenario: Preview renders declared variables
- **WHEN** a teacher previews a valid template with representative values
- **THEN** the response shows the rendered text without calling the model

#### Scenario: Undeclared placeholder is rejected
- **WHEN** a template contains an undeclared or unsupported variable
- **THEN** the server returns HTTP 400 and does not save it

#### Scenario: Client cannot inject system template
- **WHEN** a user includes a replacement system prompt in a conversation request
- **THEN** the server ignores it and renders the application's saved template

### Requirement: Provider request includes rendered template
Every model request for an application SHALL include the rendered prompt template together with only the current application's allowed retrieval, skill, conversation, and tool context.

#### Scenario: Trace proves template participation
- **WHEN** an authorized teacher views a sanitized execution trace
- **THEN** the trace identifies the template and version used and shows a redacted or bounded rendered prompt summary

