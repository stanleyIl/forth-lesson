# Spec Delta

## Purpose

Defines secure account/password authentication and trusted session behavior for teachers and students accessing protected CampusClaw resources.

## ADDED Requirements

### Requirement: Teacher and student account login
The system SHALL allow an existing teacher or student account to authenticate with its account identifier and password. A successful login SHALL establish an authenticated session, and a failed login SHALL NOT reveal whether the account identifier or password was incorrect.

#### Scenario: Teacher logs in with valid credentials
- **WHEN** a teacher submits a valid account identifier and matching password to the login endpoint
- **THEN** the system returns a successful login response and establishes an authenticated session for that teacher

#### Scenario: Student logs in with valid credentials
- **WHEN** a student submits a valid account identifier and matching password to the login endpoint
- **THEN** the system returns a successful login response and establishes an authenticated session for that student

#### Scenario: Login is rejected for invalid credentials
- **WHEN** a user submits an unknown account identifier or a non-matching password
- **THEN** the system returns HTTP 401 with a generic authentication failure and does not establish an authenticated session

### Requirement: Protected resources require authentication
The system SHALL enforce authentication on every protected resource at the server boundary.

#### Scenario: Unauthenticated API request is rejected
- **WHEN** a client without a valid authenticated session requests a protected API resource
- **THEN** the server returns HTTP 401 and does not return protected data or perform the protected action

#### Scenario: Unauthenticated browser request is guided to login
- **WHEN** a browser without a valid authenticated session requests a protected page
- **THEN** the server redirects the browser to the login page without returning the protected page content

#### Scenario: Authenticated request reaches protected resource
- **WHEN** a client with a valid authenticated session requests a protected resource
- **THEN** the server evaluates the request using the authenticated user's identity and applicable authorization rules

### Requirement: Passwords use secure non-plaintext storage
The system MUST store passwords only as salted, adaptive, one-way password hashes suitable for password storage. Plaintext passwords and reversibly encrypted passwords MUST NOT be persisted or logged.

#### Scenario: Password storage does not contain plaintext
- **WHEN** a user account password is provisioned or changed by an authorized administrative process
- **THEN** the persisted credential contains a salted adaptive password hash and does not contain the plaintext password

#### Scenario: Password verification uses the stored hash
- **WHEN** a user attempts to log in
- **THEN** the server verifies the submitted password against the stored password hash without decrypting or retrieving a plaintext password

### Requirement: Session identity is trusted and complete
For every authenticated request, the server SHALL be able to determine the authenticated user's `user_id`, `role`, and `class_id` from a server-trusted session context. Client-provided identity or class fields SHALL NOT override that context.

#### Scenario: Session exposes required identity attributes
- **WHEN** login succeeds for a teacher or student
- **THEN** subsequent authenticated requests have a trusted session context containing that account's `user_id`, `role`, and `class_id`

#### Scenario: Client attempts to override session identity
- **WHEN** an authenticated client sends request fields or headers claiming a different `user_id`, `role`, or `class_id`
- **THEN** the server ignores those claims and authorizes the request using the trusted session context

#### Scenario: Invalid or expired session is rejected
- **WHEN** a client presents a missing, invalid, expired, or tampered session credential to a protected API
- **THEN** the server returns HTTP 401 and does not treat the request as authenticated

### Requirement: Sensitive session configuration comes from the environment
Session signing, encryption, or equivalent secret key material MUST be supplied to the server through environment variables and MUST NOT be hard-coded in source code or baked into the application image.

#### Scenario: Server starts with valid session configuration
- **WHEN** the server starts with the required session secret environment variable set to an acceptable value
- **THEN** session handling is initialized and the server can accept requests

#### Scenario: Server refuses missing session secret
- **WHEN** the server starts without the required session secret environment variable
- **THEN** startup fails with a clear configuration error before the server accepts application traffic

