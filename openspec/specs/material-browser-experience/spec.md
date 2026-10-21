# material-browser-experience Specification

## Purpose
Defines the authenticated browser experience for safely discovering, viewing, downloading, filtering, and uploading class-scoped teaching materials while preserving server-side authorization as the security boundary.

## Requirements

### Requirement: Browser restores trusted identity and renders role-appropriate actions
The authenticated materials page SHALL load the current identity from `GET /api/me`, redirect to login on HTTP 401, show upload controls only to teachers, and offer logout. Hiding a control SHALL NOT replace server authorization.

#### Scenario: Teacher sees upload workflow
- **WHEN** an authenticated teacher opens the materials page
- **THEN** the page shows the trusted role/class identity, upload controls, material browsing controls, retrieval, download, and logout

#### Scenario: Student does not see upload workflow
- **WHEN** an authenticated student opens the materials page
- **THEN** the page shows same-class browsing, detail, download, and retrieval but does not render the upload control

#### Scenario: Logout returns browser to login
- **WHEN** an authenticated user activates logout
- **THEN** the browser calls the logout operation, clears displayed protected state, and navigates to the login page

### Requirement: Materials can be safely browsed and inspected
The page SHALL present database-backed same-class materials in responsive list and grid modes, provide local filtering over the loaded same-class set, and open an allowed material detail view. Markdown display MUST NOT execute embedded scripts or unsafe HTML.

#### Scenario: User switches list and grid views
- **WHEN** an authenticated user selects list or grid view
- **THEN** the same authorized materials remain visible in the selected responsive layout without changing authorization scope

#### Scenario: Local filtering stays inside loaded class data
- **WHEN** a user filters materials by filename or type
- **THEN** only the already authorized same-class material collection is filtered and no cross-class request parameter is introduced

#### Scenario: Markdown script is not executed
- **WHEN** an allowed Markdown material contains embedded script or unsafe HTML
- **THEN** the detail presentation escapes or sanitizes it and no script executes

#### Scenario: Material source can be downloaded
- **WHEN** a user activates download for an allowed material
- **THEN** the browser uses the authenticated file operation and receives the source file

### Requirement: Browser provides course-aligned interaction feedback
The materials page SHALL support light/dark theme switching, a keyboard command palette opened by Command/Ctrl+K, visible upload progress for teachers, and toast or inline feedback for success and 401/403/404/validation failures.

#### Scenario: Theme can be changed
- **WHEN** a user switches theme
- **THEN** the page updates between readable light and dark presentations and preserves the preference locally without treating it as identity or authorization data

#### Scenario: Command palette opens from keyboard
- **WHEN** the focused page receives Command+K or Ctrl+K
- **THEN** a command palette opens with available navigation and role-appropriate actions

#### Scenario: Upload shows progress and completion feedback
- **WHEN** a teacher uploads a valid material
- **THEN** the page displays transfer progress and then reports success and refreshes the same-class material list

#### Scenario: Protected failure is presented without leakage
- **WHEN** a browser operation receives 401, 403, 404, or validation failure
- **THEN** the page redirects or displays a bounded user-facing message without exposing SQL, storage paths, secrets, or cross-class metadata

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
