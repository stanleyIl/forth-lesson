# service-operations Specification

## Purpose
Defines a reproducible Docker Compose startup contract and a health endpoint for determining whether the CampusClaw web service is running.

## Requirements

### Requirement: System starts with Docker Compose
The repository SHALL provide a Docker Compose configuration that starts the CampusClaw application and all runtime dependencies required for this iteration using documented environment configuration.

#### Scenario: Compose startup succeeds with valid configuration
- **WHEN** an operator supplies the documented required environment variables and runs the documented Docker Compose startup command
- **THEN** the application and required dependencies start without requiring manual host-side service setup

#### Scenario: Missing required secret prevents unsafe startup
- **WHEN** an operator starts the Docker Compose stack without the required session secret configuration
- **THEN** the application service fails clearly instead of starting with a hard-coded or insecure default secret

#### Scenario: Persisted data survives application container recreation
- **WHEN** the application container is recreated without intentionally deleting configured persistent volumes
- **THEN** previously committed database records and uploaded material files remain available

### Requirement: Health endpoint reports service liveness
The application SHALL expose `GET /health` without requiring authentication. When the application process is able to serve requests, the endpoint SHALL return HTTP 200 with a machine-readable healthy status.

#### Scenario: Healthy service responds
- **WHEN** a client sends `GET /health` while the application is running and able to serve requests
- **THEN** the server returns HTTP 200 with a JSON body indicating a healthy status

#### Scenario: Health endpoint does not require login
- **WHEN** a client without an authenticated session sends `GET /health`
- **THEN** the server returns the health response without redirecting to login or returning HTTP 401

#### Scenario: Compose can use the health endpoint
- **WHEN** the Docker Compose health check requests `GET /health` from a healthy application container
- **THEN** the health check command succeeds based on the HTTP 200 response

### Requirement: Repository documentation supports third-party reproduction
The README SHALL document the iteration scope and non-goals, required environment variables, single-instance Docker Compose startup, seed operation and demonstration accounts, protected page/API locations, expected 401/403/404 behavior, material download behavior, retrieval provider setup and fallback, persistence, and verification commands without including real credentials.

#### Scenario: Third party starts from documented steps
- **WHEN** a third party clones the public repository, creates local environment values from `.env.example`, and follows the README commands
- **THEN** the database and application become healthy and the login page is reachable without undocumented host services

#### Scenario: Documentation explains security responses
- **WHEN** a reviewer reads only the README
- **THEN** the reviewer can identify which operations produce 401, 403, and class-hiding 404 responses and that credentials remain server-side

### Requirement: Acceptance evidence covers lesson-three and lesson-four paths
The repository SHALL retain a versioned verification document mapping the course's principal success and failure paths to automated tests or reproducible Compose commands.

#### Scenario: Reviewer can reproduce principal paths
- **WHEN** a reviewer opens the verification document
- **THEN** it identifies evidence for login/logout, same-class student read/download, student upload denial, cross-class 404, valid and invalid upload, persistence, lexical fallback, hybrid retrieval, source traceability, and secret redaction

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
