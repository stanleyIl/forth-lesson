# Spec Delta

## ADDED Requirements

### Requirement: Login can issue a revocable JWT Bearer access token
The system SHALL allow a valid teacher or student login to issue a short-lived signed JWT access token while preserving the existing Session Cookie login behavior. The JWT SHALL contain only the server-trusted subject, role, class, token-session identifier, issuer, audience, issued-at, and expiry claims.

#### Scenario: Valid login returns access token
- **WHEN** a teacher or student submits valid credentials to the token-capable login operation
- **THEN** the server returns a signed access token, token type `Bearer`, and expiry information without returning password or signing-secret data

#### Scenario: Invalid credentials do not issue token
- **WHEN** a client submits an unknown account or wrong password
- **THEN** the server returns the same generic HTTP 401 response and creates no valid token session

### Requirement: Protected APIs accept trusted Authorization Bearer tokens
Protected API authentication SHALL accept a syntactically valid, signed, unexpired, unrevoked JWT from the `Authorization: Bearer <token>` header. The effective user, role, and class SHALL come from validated token claims and the matching server-side token-session/user records, never from request body, query, or extra headers.

#### Scenario: Bearer token authenticates protected request
- **WHEN** a client sends a valid access token in the Authorization header to a protected API
- **THEN** the server authenticates the subject and applies the token session's current role and class authorization

#### Scenario: Forged identity fields are ignored
- **WHEN** a valid class-A Bearer request also claims another user, role, or class in body, query, route, or headers
- **THEN** the server continues to authorize only the validated class-A token identity

#### Scenario: Missing malformed or tampered token is rejected
- **WHEN** a protected Bearer request has a missing, malformed, unsupported-algorithm, incorrectly signed, or tampered token
- **THEN** the server returns HTTP 401 without protected data

#### Scenario: Expired or revoked token is rejected
- **WHEN** an access token is expired or its server-side token session has been revoked
- **THEN** the server returns HTTP 401 without accepting token claims

### Requirement: Token logout revokes subsequent Bearer use
The token logout operation SHALL revoke the current access token's server-side token session. Browser logout SHALL also remove the locally held token.

#### Scenario: Token is unusable after logout
- **WHEN** an authenticated Bearer client logs out and then reuses the same token
- **THEN** the next protected request returns HTTP 401

### Requirement: JWT configuration and token values remain protected
JWT signing secrets, raw access tokens, and Authorization headers MUST NOT be persisted in source control or application logs. Signing key material and token lifetime SHALL be validated server configuration.

#### Scenario: Missing JWT secret prevents token service startup
- **WHEN** token authentication is enabled without an acceptable JWT signing secret
- **THEN** startup fails before token login is accepted

#### Scenario: Logs redact access token
- **WHEN** a Bearer-authenticated request succeeds or fails
- **THEN** captured logs contain bounded operation metadata but not the raw token or Authorization value
