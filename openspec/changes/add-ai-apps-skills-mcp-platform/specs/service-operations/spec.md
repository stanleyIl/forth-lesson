# Spec Delta

## ADDED Requirements

### Requirement: Compose starts the lesson-six tool runtime
The Docker Compose stack SHALL start the application, database, and local MCP demonstration server with documented validated configuration and health checks. A missing required secret or unsafe tool limit SHALL prevent the affected service from starting insecurely.

#### Scenario: Complete stack starts
- **WHEN** an operator follows the documented local setup
- **THEN** the application, database, and MCP server become healthy and the seeded AI applications are usable

#### Scenario: MCP service restarts without losing application data
- **WHEN** the MCP container is recreated without deleting application volumes
- **THEN** saved applications, prompt templates, skill packages, bindings, conversations, and traces remain available

### Requirement: Lesson-six acceptance is reproducible
The repository SHALL document deterministic local steps for multiple applications, template rendering, class knowledge selection, built-in and uploaded skills, MCP discovery and execution, trace inspection, and PDF generation without requiring real credentials.

#### Scenario: Reviewer reproduces acceptance paths
- **WHEN** a reviewer clones the repository and follows the lesson-six verification document
- **THEN** the reviewer can reproduce all required behaviors and the five assignment answers using local services

### Requirement: Final PDF report is generated from sanitized evidence
The repository SHALL provide a repeatable command that generates a PDF containing the repository address, project summary, lesson-six capability evidence, and answers to the five verification questions. The PDF MUST NOT include reusable tokens, cookies, provider keys, MCP credentials, or unrestricted private content.

#### Scenario: PDF generation succeeds
- **WHEN** the documented report command runs after representative evidence exists
- **THEN** it produces a readable PDF suitable for assignment submission

