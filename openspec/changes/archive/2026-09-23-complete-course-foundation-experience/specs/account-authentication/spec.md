# Spec Delta

## ADDED Requirements

### Requirement: Authenticated browser can restore current identity
The system SHALL expose an authenticated current-user operation that returns the trusted session user's identifier, supported role, and class identifier without accepting client identity overrides.

#### Scenario: Current user is returned
- **WHEN** an authenticated teacher or student requests `GET /api/me`
- **THEN** the server returns HTTP 200 with the trusted session `user_id`, `role`, and `class_id`

#### Scenario: Current user requires authentication
- **WHEN** a client without a valid session requests `GET /api/me`
- **THEN** the server returns HTTP 401 without returning identity or material data

### Requirement: User can terminate the server-side session
The system SHALL provide logout that deletes or revokes the current server-side session and clears the browser session cookie.

#### Scenario: Logout invalidates current cookie
- **WHEN** an authenticated user submits `POST /api/logout`
- **THEN** the server returns a successful response, clears the session cookie, and the same previous cookie receives HTTP 401 on the next protected API request

#### Scenario: Logout is idempotently safe
- **WHEN** a client without a valid session submits `POST /api/logout`
- **THEN** the server returns a non-sensitive successful or authentication-required response and does not expose session details

### Requirement: Invalid-account login follows an equivalent verification path
The login operation SHALL preserve the same generic response shape for unknown accounts and wrong passwords and SHALL perform an equivalent adaptive-hash verification path for both cases.

#### Scenario: Unknown account is not trivially distinguishable
- **WHEN** a client submits an unknown account identifier
- **THEN** the server performs an adaptive password verification operation and returns the same HTTP 401 body used for a wrong password
