# Spec Delta

## ADDED Requirements

### Requirement: Browser can use Bearer token authentication
The browser SHALL obtain a token from successful login, hold it in bounded browser session storage, and add `Authorization: Bearer <token>` to protected API, upload, search, question-answer, configuration, conversation, and streaming requests. It SHALL remove the token on logout or HTTP 401 and SHALL NOT store role/class as trusted authorization state.

#### Scenario: Protected browser request contains Bearer header
- **WHEN** a logged-in browser loads materials or another protected API
- **THEN** the network request includes an Authorization Bearer header and the response is authorized from the validated token

#### Scenario: Browser clears rejected token
- **WHEN** a protected request returns HTTP 401
- **THEN** the browser removes the access token and navigates to login

### Requirement: Browser exposes knowledge search and grounded answer modes
The authenticated page SHALL provide separate knowledge-search and knowledge-answer modes. Answer mode SHALL show the user's question, generated or fixed no-hit answer, ordered citation markers, and source cards that open allowed material details.

#### Scenario: Grounded answer displays citations
- **WHEN** the answer API returns cited evidence
- **THEN** the page displays `[1]`, `[2]` markers consistently with filename, chunk index, offsets, and excerpt source cards

#### Scenario: No-hit answer displays no source cards
- **WHEN** the answer API returns the fixed no-hit response
- **THEN** the page displays that response and no fabricated citation cards

### Requirement: Browser supports prompt skill and streaming conversation workflows
Teachers SHALL see controls for editing their class prompt and toggling guided solving. Students SHALL see the effective assistant behavior but no modification controls. Users SHALL be able to select conversations, send follow-ups, and see SSE answer deltas appear incrementally.

#### Scenario: Teacher sees configuration controls
- **WHEN** a teacher opens the assistant page
- **THEN** prompt and guided-solving controls are available for the teacher's class

#### Scenario: Student cannot see modification controls
- **WHEN** a student opens the assistant page
- **THEN** conversation and question controls are available but prompt/skill modification controls are absent

#### Scenario: Streaming answer updates incrementally
- **WHEN** the browser receives answer delta events
- **THEN** the visible assistant message is updated before the final done event and citations remain associated with the message
