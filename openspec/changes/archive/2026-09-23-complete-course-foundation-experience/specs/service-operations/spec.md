# Spec Delta

## ADDED Requirements

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
