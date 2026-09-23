# Spec Delta

## Purpose

Defines the complete, class-scoped ingestion of teacher-uploaded text and Markdown teaching materials into durable files and linked knowledge records.

## ADDED Requirements

### Requirement: Upload accepts valid text and Markdown files
The material upload operation SHALL accept a non-empty `.txt` or `.md` file only when its content is valid UTF-8 text and it satisfies the configured upload-size limit.

#### Scenario: Valid text file passes validation
- **WHEN** an authenticated teacher uploads a non-empty `.txt` file containing valid UTF-8 text within the upload-size limit
- **THEN** the system accepts the file for ingestion

#### Scenario: Valid Markdown file passes validation
- **WHEN** an authenticated teacher uploads a non-empty `.md` file containing valid UTF-8 text within the upload-size limit
- **THEN** the system accepts the file for ingestion

#### Scenario: Unsupported file type is rejected
- **WHEN** an authenticated teacher uploads a file whose extension is neither `.txt` nor `.md`
- **THEN** the server returns HTTP 415 and creates no stored file, `materials` record, or `knowledge_entries` record

#### Scenario: Empty file is rejected
- **WHEN** an authenticated teacher uploads an empty `.txt` or `.md` file
- **THEN** the server returns HTTP 400 and creates no stored file, `materials` record, or `knowledge_entries` record

#### Scenario: Invalid text encoding is rejected
- **WHEN** an authenticated teacher uploads a `.txt` or `.md` file that cannot be decoded as valid UTF-8 text
- **THEN** the server returns HTTP 400 and creates no stored file, `materials` record, or `knowledge_entries` record

#### Scenario: Oversized file is rejected
- **WHEN** an authenticated teacher uploads a `.txt` or `.md` file larger than the configured upload-size limit
- **THEN** the server returns HTTP 413 and creates no stored file, `materials` record, or `knowledge_entries` record

### Requirement: Accepted files are durably persisted
After validation succeeds, the system SHALL store the uploaded file in durable application-managed storage using a server-generated storage identifier. The original filename SHALL be retained only as metadata and SHALL NOT control the storage path.

#### Scenario: Accepted file is stored
- **WHEN** a valid teacher upload completes successfully
- **THEN** the uploaded file exists in durable storage and can be associated with the created material record

#### Scenario: Unsafe original filename is neutralized
- **WHEN** a valid upload has an original filename containing path separators or traversal sequences
- **THEN** the server-generated storage location remains within the configured material storage area and the original filename is retained only as non-authoritative metadata

#### Scenario: Storage failure prevents ingestion completion
- **WHEN** durable file persistence fails after validation
- **THEN** the server returns an error and creates no `materials` or `knowledge_entries` records for that upload

### Requirement: Uploaded text is parsed into knowledge entries
The system SHALL decode the stored `.txt` or `.md` content as UTF-8 text and create one or more non-empty `knowledge_entries` records representing the parsed textual content.

#### Scenario: Text content creates knowledge entries
- **WHEN** a valid `.txt` upload completes successfully
- **THEN** one or more `knowledge_entries` records contain the parsed non-empty text from the uploaded file

#### Scenario: Markdown content creates knowledge entries
- **WHEN** a valid `.md` upload completes successfully
- **THEN** one or more `knowledge_entries` records contain the parsed non-empty Markdown text from the uploaded file

#### Scenario: Parsing failure leaves no partial ingestion
- **WHEN** text parsing fails after the file has been written
- **THEN** the server returns an error, creates no `materials` or `knowledge_entries` records, and removes or marks unusable the newly written file so it is not treated as an available material

### Requirement: Material and knowledge records are linked and class-scoped
A successful upload SHALL create one `materials` record and one or more related `knowledge_entries` records. The server SHALL set every created record's `class_id` from the authenticated teacher's trusted session and SHALL link each knowledge entry to the created material.

#### Scenario: Successful upload creates linked records
- **WHEN** an authenticated teacher uploads a valid file and storage and parsing succeed
- **THEN** the system creates exactly one `materials` record and at least one `knowledge_entries` record linked to that material

#### Scenario: Created data uses the teacher's class
- **WHEN** a teacher in class A successfully uploads a valid file
- **THEN** the stored file association, `materials` record, and every related `knowledge_entries` record are assigned to class A

#### Scenario: Client cannot select another class for an upload
- **WHEN** a teacher in class A submits class B's identifier with an otherwise valid upload
- **THEN** the system ignores the supplied class identifier and assigns all created data to class A

#### Scenario: Database failure does not expose partial records
- **WHEN** creation of the material or any knowledge entry fails
- **THEN** the ingestion fails as a unit, no partial material or knowledge records remain available, and the newly stored file is removed or marked unusable

