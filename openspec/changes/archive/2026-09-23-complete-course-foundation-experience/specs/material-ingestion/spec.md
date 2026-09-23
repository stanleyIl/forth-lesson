# Spec Delta

## ADDED Requirements

### Requirement: Seed data supports reproducible two-class acceptance
The administrative seed operation SHALL idempotently create distinguishable class-A and class-B acceptance data, including a class-A teacher, a class-A student, a class-B student, and at least one material and knowledge entry for each class. Seed credentials SHALL come from environment variables and SHALL be stored only as adaptive password hashes.

#### Scenario: Seed creates same-class teacher and student
- **WHEN** an operator runs the seed command against an empty migrated database with the documented credential variables
- **THEN** class A contains a teacher and a student that can independently authenticate and access the same class-A material

#### Scenario: Seed creates distinguishable second-class data
- **WHEN** seed completes
- **THEN** class B contains a student and material/knowledge content whose filename or text is distinguishable from class A for isolation verification

#### Scenario: Seed is repeatable
- **WHEN** the seed command is run more than once
- **THEN** it does not duplicate users, materials, or knowledge entries and does not overwrite teacher-uploaded content

### Requirement: Uploaded source files are retrievable through protected operations
The system SHALL allow an authenticated teacher or student to download the original bytes of an allowed same-class material through an authenticated API operation. Uploaded files SHALL NOT be exposed by an unauthenticated static directory.

#### Scenario: Same-class user downloads material
- **WHEN** an authenticated user requests the file operation for a material in the user's class
- **THEN** the server returns the stored bytes with a safe content type and attachment filename derived from the original filename

#### Scenario: Missing stored file is handled generically
- **WHEN** an authorized material record exists but its durable file is unavailable
- **THEN** the server returns a generic unavailable or not-found response without exposing the storage key or filesystem path
