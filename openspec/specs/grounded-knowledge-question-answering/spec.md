# grounded-knowledge-question-answering Specification

## Purpose
Defines evidence-gated AI question answering that uses only authenticated class knowledge, produces ordered source citations, and refuses to generate when no relevant course material is available.

## Requirements

### Requirement: Authenticated users can ask a grounded class question
The system SHALL allow an authenticated teacher or student to submit a bounded non-empty question. The question-answer operation SHALL first execute same-class hybrid chunk retrieval and select at most four eligible chunks.

#### Scenario: Question retrieves top class chunks
- **WHEN** an authenticated user submits a valid question
- **THEN** the server performs trusted-class hybrid search and selects no more than four ranked chunks

#### Scenario: Client system and class instructions are ignored
- **WHEN** a request includes client-provided system messages, role instructions, user identifiers, or class identifiers
- **THEN** the server discards them and uses only server-controlled instructions and authenticated class scope

### Requirement: Model is called only when evidence exists
The system MUST NOT call the chat-generation provider when retrieval returns no eligible chunks. It SHALL return HTTP 200 with the fixed answer `资料中未找到相关内容` and an empty citations list.

#### Scenario: No-hit answer does not call model
- **WHEN** hybrid retrieval returns zero eligible chunks
- **THEN** the response contains the fixed no-hit answer, empty citations, and provider call count remains unchanged

### Requirement: Grounded answer cites ordered evidence
When evidence exists, the server SHALL provide the model only the bounded question, server-controlled instruction, optional bounded prior history, and numbered chunk source records. The returned short answer SHALL use `[1]`, `[2]` citation markers corresponding to the response citations order.

#### Scenario: Answer and citation order match
- **WHEN** the model produces an answer using retrieved chunks
- **THEN** citation marker `[1]` refers to the first citation object, `[2]` to the second, and each citation includes filename, chunk index, offsets, excerpt, material ID, entry ID, and chunk ID

#### Scenario: Provider cannot access vectors or foreign data
- **WHEN** a grounded answer request calls the chat provider
- **THEN** the provider input contains no embedding vectors, credentials, storage paths, or other-class content

#### Scenario: Chat provider failure is generic
- **WHEN** evidence exists but the chat provider times out, returns malformed output, or fails
- **THEN** the server returns generic HTTP 503 without fabricated answer, citations, provider credentials, or raw provider details
