# streaming-assistant-conversations Specification

## Purpose
Defines persistent, class-scoped assistant conversations whose grounded responses are streamed to authenticated clients through server-sent event framing while preserving ordered evidence and follow-up context.

## Requirements

### Requirement: Users have persistent scoped conversations
The system SHALL allow an authenticated user to create, list, open, and continue only that user's conversations within the authenticated class. Conversation messages SHALL persist user questions, assistant answers, timestamps, and citation metadata.

#### Scenario: Student creates and reopens conversation
- **WHEN** a student creates a conversation, receives an answer, and later opens that conversation
- **THEN** the prior user and assistant messages plus citations are returned in order

#### Scenario: Foreign conversation is hidden
- **WHEN** a user requests another user's or another class's conversation identifier
- **THEN** the server returns the same HTTP 404 public response used for a nonexistent conversation

### Requirement: Assistant answer is delivered through SSE events
The streaming answer operation SHALL authenticate the Bearer token before opening the stream and SHALL emit valid `text/event-stream` events representing metadata, citation records, answer deltas, completion, or a bounded error.

#### Scenario: Stream returns ordered events
- **WHEN** an authenticated user asks a question with evidence in a conversation
- **THEN** the response emits conversation/message metadata, ordered citations, one or more answer delta events, and a final done event

#### Scenario: Stream no-hit ends without model call
- **WHEN** retrieval has no eligible chunks
- **THEN** the stream emits the fixed no-hit answer and done event, persists that response with empty citations, and does not call the chat provider

#### Scenario: Stream failure is bounded
- **WHEN** the provider fails after the stream begins
- **THEN** the server emits a generic error event, does not expose provider details, and does not persist a fabricated completed answer

### Requirement: Follow-up uses bounded trusted history
A continued conversation SHALL provide the model with a bounded number or size of prior persisted user/assistant messages. Client-supplied system messages or edited history SHALL NOT replace server history.

#### Scenario: Follow-up includes prior persisted context
- **WHEN** a user asks a follow-up in an existing allowed conversation
- **THEN** the provider input contains bounded persisted conversation history plus the current prompt, skill instruction, and new same-class evidence

#### Scenario: Client-forged history is ignored
- **WHEN** the streaming request contains forged assistant/system history
- **THEN** the server ignores it and uses only persisted allowed conversation messages
