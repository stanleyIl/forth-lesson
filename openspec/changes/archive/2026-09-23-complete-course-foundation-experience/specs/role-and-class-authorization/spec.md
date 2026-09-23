# Spec Delta

## ADDED Requirements

### Requirement: Teachers and students have class-scoped material read permissions
Authenticated teachers and students SHALL be allowed to list, view, and download materials only from their trusted session class. Students SHALL remain unable to upload or modify materials.

#### Scenario: Same-class student views and downloads material
- **WHEN** a class-A student requests the detail or file for a class-A material
- **THEN** the server returns the allowed material detail or file

#### Scenario: Student upload remains forbidden
- **WHEN** an authenticated student bypasses the browser and calls the upload API directly
- **THEN** the server returns HTTP 403 and does not change durable files, materials, knowledge entries, or embeddings

### Requirement: Object access hides cross-class existence
Material detail, material file, and knowledge-entry object operations SHALL return the same HTTP 404 response shape for nonexistent identifiers and identifiers belonging to another class. The response MUST NOT contain protected metadata, content, storage identifiers, or filesystem paths.

#### Scenario: Cross-class material detail is indistinguishable from missing
- **WHEN** a class-A user requests a class-B material identifier and then requests a nonexistent material identifier
- **THEN** both responses are HTTP 404 with the same public error shape and neither contains class-B data

#### Scenario: Cross-class file download is indistinguishable from missing
- **WHEN** a class-A user requests the file endpoint for a class-B material
- **THEN** the server returns HTTP 404 without reading or returning the class-B file

#### Scenario: Cross-class knowledge entry remains hidden
- **WHEN** a class-A user requests a class-B knowledge-entry identifier
- **THEN** the server returns the same HTTP 404 public shape used for a nonexistent entry
