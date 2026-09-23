# Spec Delta

## Purpose

Defines server-enforced teacher/student permissions and class-scoped data isolation so one class cannot access another class's teaching materials.

## ADDED Requirements

### Requirement: Accounts have a supported role
Every authenticated user SHALL have exactly one supported role: `teacher` or `student`. Requests associated with any other or missing role SHALL NOT be authorized as teacher or student operations.

#### Scenario: Teacher role is recognized
- **WHEN** an authenticated session identifies its user role as `teacher`
- **THEN** the server evaluates the request against teacher permissions

#### Scenario: Student role is recognized
- **WHEN** an authenticated session identifies its user role as `student`
- **THEN** the server evaluates the request against student permissions

#### Scenario: Unsupported role is denied
- **WHEN** an authenticated session has a missing or unsupported role
- **THEN** the server returns HTTP 403 for a protected role-gated operation

### Requirement: Material upload is teacher-only
The server SHALL authorize material upload only when the authenticated session role is `teacher`. Frontend visibility or disabled controls SHALL NOT be used as the authorization boundary.

#### Scenario: Teacher may enter the upload workflow
- **WHEN** an authenticated teacher sends a material upload request
- **THEN** the server proceeds to file validation and class-scoped ingestion

#### Scenario: Student direct API upload is forbidden
- **WHEN** an authenticated student calls the material upload API directly with any file
- **THEN** the server returns HTTP 403 and creates no stored file, `materials` record, or `knowledge_entries` record

#### Scenario: Unauthenticated upload is rejected
- **WHEN** a client without a valid authenticated session calls the material upload API
- **THEN** the server returns HTTP 401 and creates no stored file, `materials` record, or `knowledge_entries` record

### Requirement: Class is the material data isolation boundary
The server SHALL derive the effective `class_id` from the authenticated session and SHALL restrict every material read query to that `class_id`. A request parameter, route value, body field, or header SHALL NOT grant access to another class.

#### Scenario: User reads a material from the same class
- **WHEN** an authenticated user requests a material whose `class_id` equals the user's session `class_id`
- **THEN** the server returns the material if the user's remaining permissions allow the requested operation

#### Scenario: User cannot read a material from another class
- **WHEN** a user in class A directly requests a material whose `class_id` is class B
- **THEN** the server returns HTTP 404 without returning the material content or metadata

#### Scenario: Material listing contains only the current class
- **WHEN** an authenticated user requests a material list
- **THEN** every returned material has the same `class_id` as the user's trusted session context

#### Scenario: Client-supplied class override is ignored
- **WHEN** a class A user supplies class B's identifier in query parameters, route parameters, request body, or headers while reading materials
- **THEN** the server still scopes the read to class A and returns no class B material

### Requirement: Class isolation applies to knowledge entries
The server SHALL scope access to `knowledge_entries` by the authenticated user's `class_id`, including access reached through a related material.

#### Scenario: Same-class knowledge entry is accessible through an allowed material read
- **WHEN** an authenticated user accesses knowledge content associated with a material in the user's class
- **THEN** the server may return only knowledge entries whose `class_id` matches the user's session `class_id`

#### Scenario: Cross-class knowledge entry is not disclosed
- **WHEN** a class A user directly or indirectly requests a knowledge entry assigned to class B
- **THEN** the server returns HTTP 404 and does not disclose the entry's content or metadata

