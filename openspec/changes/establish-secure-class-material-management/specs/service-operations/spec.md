# Spec Delta

## Purpose

Defines a reproducible Docker Compose startup contract and a health endpoint for determining whether the CampusClaw web service is running.

## ADDED Requirements

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

