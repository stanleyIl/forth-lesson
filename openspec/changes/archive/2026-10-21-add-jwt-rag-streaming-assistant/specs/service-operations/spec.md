# Spec Delta

## ADDED Requirements

### Requirement: JWT and chat provider configuration is server-controlled
The service SHALL validate JWT signing/issuer/audience/TTL settings and OpenAI-compatible chat endpoint/model/timeout/optional credential settings before accepting the affected operations. Secrets MUST remain server-side and absent from images, client responses, logs, and committed evidence.

#### Scenario: Valid AI and token configuration starts
- **WHEN** the service starts with valid JWT and chat configuration
- **THEN** token login, grounded ask, and streaming assistant modules initialize successfully

#### Scenario: Invalid security bounds fail startup
- **WHEN** JWT secret length, token TTL, chat timeout, history limit, question limit, or answer limit is malformed or unsafe
- **THEN** startup fails with a clear configuration error before affected traffic is accepted

### Requirement: Course assignment evidence is reproducible
The repository SHALL document and retain reproducible evidence for a grounded AI answer and Bearer-token authenticated protected request without committing live provider credentials or long-lived production tokens.

#### Scenario: AI answer screenshot can be reproduced
- **WHEN** an operator follows the documented seed/provider/startup steps and asks a question represented in class material
- **THEN** the browser shows a grounded answer with ordered source citations comparable to the teacher example

#### Scenario: Token authentication screenshot can be reproduced
- **WHEN** an operator logs in through the token browser flow and inspects a protected network request
- **THEN** DevTools shows an Authorization Bearer header and the page shows the corresponding authenticated teacher or student identity
